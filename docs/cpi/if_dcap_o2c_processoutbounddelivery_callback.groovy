import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import java.io.BufferedReader
import java.io.Reader
import groovy.util.XmlSlurper
import groovy.util.slurpersupport.GPathResult
import groovy.xml.QName

Message processData(Message message) {
    Reader bodyReader = message.getBody(java.io.Reader.class)
    if (!bodyReader) {
        return message
    }

    // Get fileType from header (passed from original upload)
    String fileType = safeText(message.getHeaders().get("fileType"))
    if (!fileType) {
        // Try alternative header names
        fileType = safeText(message.getHeaders().get("x-file-type"))
    }
    if (!fileType) {
        fileType = safeText(message.getHeaders().get("uploadType"))
    }

    List<Map> detailResults = []
    List<Map> callbackItems = []
    int successCount = 0
    int errorCount = 0

    try {
        Map<String, Object> root = parseRootObject(bodyReader)
        List<Map> resultRows = extractResultRows(root)
        Map<String, Map> returnByRequest = buildReturnMap(root)

        resultRows.each { Map row ->
            Map transformed = transformDeliveryRow(row, returnByRequest)
            detailResults << transformed.detail
            callbackItems << transformed.callbackItem
            if (transformed.isSuccess) {
                successCount += 1
            } else {
                errorCount += 1
            }
        }

        if (detailResults.isEmpty()) {
            Map fallback = buildFallbackErrorRow("No EtResults/results records found in outbound delivery response")
            detailResults << fallback.detail
            callbackItems << fallback.callbackItem
            errorCount = 1
        }
    } catch (Exception ex) {
        Map fallback = buildFallbackErrorRow("Parse outbound delivery callback failed: ${ex.message}")
        detailResults = [fallback.detail]
        callbackItems = [fallback.callbackItem]
        successCount = 0
        errorCount = 1
    }

    Map overallPicking = aggregateStage(detailResults, "pickingStatus")
    Map overallPgi = aggregateStage(detailResults, "pgiStatus")
    int totalItemCount = detailResults.collect { Map row -> ((row.itemCount ?: 0) as int) }.sum() ?: 0

    String callbackStatus = resolveOverallCallbackStatus(errorCount, successCount, overallPgi, overallPicking)
    String callbackStep = (callbackStatus == "ERROR")
        ? "IF_DCAP_O2C_ProcessOutboundDelivery: Failed"
        : (callbackStatus == "PARTIAL")
            ? "IF_DCAP_O2C_ProcessOutboundDelivery: Delivery Processed With Warnings"
            : (overallPgi.code == "COMPLETED")
                ? "IF_DCAP_O2C_ProcessOutboundDelivery: PGI Completed"
                : (overallPicking.code == "COMPLETED")
                    ? "IF_DCAP_O2C_ProcessOutboundDelivery: Picking Completed"
                    : (overallPicking.code == "IN_PROGRESS")
                        ? "IF_DCAP_O2C_ProcessOutboundDelivery: Picking In Progress"
                        : "IF_DCAP_O2C_ProcessOutboundDelivery: Delivery Processed"

    String overallMessage = buildOverallMessage(successCount, errorCount, overallPicking, overallPgi)

    Map firstDetail = detailResults[0] ?: [:]

    Map payloadObject = [
        summary            : overallMessage,
        successCount       : successCount,
        errorCount         : errorCount,
        resultsCount       : detailResults.size(),
        itemCount          : totalItemCount,
        deliveryStatus     : firstNonEmpty(firstDetail.deliveryStatus, "DELIVERY_CREATED"),
        pickingStatus      : overallPicking.code,
        pickingStatusText  : overallPicking.text,
        pickingDate        : firstNonEmpty(firstDetail.pickingDate),
        pickingBy          : firstNonEmpty(firstDetail.pickingBy),
        pgiStatus          : overallPgi.code,
        pgiStatusText      : overallPgi.text,
        pgiDate            : firstNonEmpty(firstDetail.pgiDate),
        pgiBy              : firstNonEmpty(firstDetail.pgiBy),
        pgiDocument        : firstNonEmpty(firstDetail.pgiDocument),
        results            : detailResults,
        fileType           : fileType
    ]

    Map callbackPayload = [
        status             : errorCount > 0 ? (successCount > 0 ? "PARTIAL" : "FAIL") : "SUCCESS",
        callbackSource     : "WAREHOUSE",
        callbackStatus     : callbackStatus,
        callbackStep       : callbackStep,
        message            : overallMessage,
        requestId          : firstNonEmpty(firstDetail.requestId),
        quotationNo        : firstNonEmpty(firstDetail.quotationNo),
        salesOrder         : firstNonEmpty(firstDetail.salesOrder),
        deliveryDoc        : firstNonEmpty(firstDetail.deliveryDoc),
        billingDoc         : "",
        fileType           : fileType,
        uploadType         : fileType,
        payload            : JsonOutput.toJson(payloadObject),
        items              : callbackItems
    ]

    message.setProperty("capRoute", callbackPayload.status)

    message.setHeader("CamelHttpMethod", "POST")
    message.setHeader("Content-Type", "application/json")
    message.setHeader("Accept", "application/json")
    message.setBody(JsonOutput.prettyPrint(JsonOutput.toJson(callbackPayload)))
    return message
}

Map<String, Object> parseRootObject(Reader bodyReader) {
    Reader reader = bodyReader.markSupported() ? bodyReader : new BufferedReader(bodyReader)
    reader.mark(4096)

    int nextChar = -1
    while (true) {
        nextChar = reader.read()
        if (nextChar < 0 || !Character.isWhitespace((char) nextChar)) {
            break
        }
    }

    reader.reset()

    if (nextChar < 0) {
        return [:]
    }

    if (nextChar == (int) '<') {
        GPathResult xml = new XmlSlurper(false, false).parse(reader)
        Object obj = gpathToObject(xml)
        return obj instanceof Map ? (Map<String, Object>) obj : [:]
    }

    Object parsed = new JsonSlurper().parse(reader)
    if (!(parsed instanceof Map)) {
        return [:]
    }

    Map jsonMap = (Map) parsed
    Object dNode = pickNode(jsonMap, ["d"])
    if (dNode instanceof Map) {
        return (Map<String, Object>) dNode
    }
    return (Map<String, Object>) jsonMap
}

Object gpathToObject(Object nodeObj) {
    if (!(nodeObj instanceof GPathResult)) {
        return nodeObj
    }

    GPathResult node = (GPathResult) nodeObj
    List<GPathResult> children = node.children().findAll { it instanceof GPathResult } as List<GPathResult>
    if (!children) {
        return safeText(node.text())
    }

    Map<String, Object> grouped = [:]
    children.each { GPathResult child ->
        String key = localName(child.name())
        Object value = gpathToObject(child)
        if (grouped.containsKey(key)) {
            Object existing = grouped[key]
            if (!(existing instanceof List)) {
                existing = [existing]
            }
            ((List) existing) << value
            grouped[key] = existing
        } else {
            grouped[key] = value
        }
    }

    return grouped
}

String localName(Object nameObj) {
    if (nameObj instanceof QName) {
        return ((QName) nameObj).localPart
    }
    String raw = String.valueOf(nameObj)
    int idx = raw.indexOf(':')
    return idx >= 0 ? raw.substring(idx + 1) : raw
}

String safeText(Object value) {
    return String.valueOf(value == null ? "" : value).trim()
}

Object pickNode(Object source, List<String> keys) {
    if (!(source instanceof Map)) {
        return null
    }

    Map map = (Map) source
    for (String wanted : keys) {
        String target = wanted.toLowerCase()
        for (Object entryObj : map.entrySet()) {
            Map.Entry entry = (Map.Entry) entryObj
            String key = String.valueOf(entry.key).toLowerCase()
            if (key == target) {
                return entry.value
            }
        }
    }

    return null
}

Object pickMapValueIgnoreCase(Map source, String wantedKey) {
    if (!(source instanceof Map) || !wantedKey) {
        return null
    }

    String target = String.valueOf(wantedKey).toLowerCase()
    for (Object entryObj in source.entrySet()) {
        Map.Entry entry = (Map.Entry) entryObj
        if (String.valueOf(entry.key).toLowerCase() == target) {
            return entry.value
        }
    }

    return null
}

List<Map> unwrapItemRows(Object container) {
    if (container == null) {
        return []
    }

    if (container instanceof List) {
        return ((List) container).findAll { it instanceof Map } as List<Map>
    }

    if (container instanceof Map) {
        Object itemNode = pickNode(container, ["item", "items", "Item"])
        if (itemNode != null) {
            return unwrapItemRows(itemNode)
        }
        return [((Map) container)]
    }

    return []
}

List<Map> extractResultRows(Map<String, Object> root) {
    Object resultNode = pickNode(root, ["EtResults", "etResults", "results"])
    List<Map> rows = unwrapItemRows(resultNode)

    if (!rows && resultNode instanceof Map) {
        rows = [((Map) resultNode)]
    }

    return rows
}

Map<String, Map> buildReturnMap(Map<String, Object> root) {
    Map<String, Map> byRequest = [:]
    Object returnNode = pickNode(root, ["EtReturn", "etReturn", "returns", "return"])
    List<Map> returnRows = unwrapItemRows(returnNode)

    returnRows.each { Map row ->
        String requestId = firstNonEmpty(
            row.ReqId,
            row.reqId,
            row.RequestId,
            row.requestId,
            row.SoReqId,
            row.soReqId,
            row.QT_REQ_ID,
            row.PpReqId,
            row.ppReqId,
            row.Items,
            row.items,
            row.purchNoC,
            row.PurchNoC
        )
        if (requestId) {
            byRequest[requestId] = row
        }
    }

    return byRequest
}

Map transformDeliveryRow(Map row, Map<String, Map> returnByRequest) {
    String requestId = firstNonEmpty(
        row.ReqId,
        row.reqId,
        row.RequestId,
        row.requestId,
        row.SoReqId,
        row.soReqId,
        row.PpReqId,
        row.ppReqId,
        row.QT_REQ_ID,
        row.purchNoC,
        row.PurchNoC
    )

    Map returnRow = requestId ? (returnByRequest[requestId] ?: [:]) : [:]

    String quotationNo = firstNonEmpty(row.QuotationNo, row.quotationNo, row.Quotation, row.quotation)
    String salesOrder = firstNonEmpty(row.SalesOrder, row.salesOrder, row.SoNumber, row.soNumber, row.SoNo, row.soNo)
    String deliveryDoc = firstNonEmpty(row.DeliveryNo, row.deliveryDoc, row.delivery, row.DeliveryDocument)
    String currency = firstNonEmpty(row.Currency, row.currency)
    String matDoc = firstNonEmpty(row.MatDoc, row.matDoc, row.MaterialDocument, row.materialDocument)

    String rawStatus = firstNonEmpty(
        row.Status,
        row.status,
        returnRow.MsgType,
        returnRow.msgType,
        returnRow.TYPE,
        returnRow.type
    )
    String rawMessage = firstNonEmpty(
        row.MsgDesc,
        row.msgDesc,
        row.Message,
        row.message,
        returnRow.MsgDesc,
        returnRow.msgDesc,
        returnRow.MESSAGE,
        returnRow.message
    )

    boolean isErrorStatus = looksLikeError(rawStatus)
    boolean hasDelivery = !!deliveryDoc
    boolean isSuccess = hasDelivery && !isErrorStatus

    List<Map> lineRows = unwrapItemRows(pickNode(row, ["ItItems", "itItems", "items", "Items"]))

    List<Map> detailItems = []
    lineRows.eachWithIndex { Map line, int index ->
        Map detailLine = transformDeliveryLine(line, row, deliveryDoc, currency, index + 1)
        detailItems << detailLine
    }

    if (detailItems.isEmpty()) {
        Map defaultLine = transformDeliveryLine([:], row, deliveryDoc, currency, 1)
        detailItems << defaultLine
    }

    Map rowPicking = aggregateStage(detailItems, "pickingStatus")
    Map rowPgi = aggregateStage(detailItems, "pgiStatus")
    boolean warehouseHasProgress = ["COMPLETED", "IN_PROGRESS"].contains(rowPgi.code) || ["COMPLETED", "IN_PROGRESS"].contains(rowPicking.code)
    isSuccess = hasDelivery && (!isErrorStatus || warehouseHasProgress)

    String deliveryStatus = hasDelivery ? "DELIVERY_CREATED" : "DELIVERY_FAILED"
    String callbackStatus = isSuccess ? resolveRowCallbackStatus(rowPgi, rowPicking) : "ERROR"
    String callbackStep = isSuccess
        ? resolveRowCallbackStep(rowPgi, rowPicking)
        : "Warehouse Picking: Failed"

    String rowPickingDate = firstNonEmpty(
        row.PickingDate,
        row.pickingDate,
        row.PickDate,
        row.pickDate,
        row.PickingAt,
        row.pickingAt
    )
    String rowPickingBy = firstNonEmpty(row.PickingBy, row.pickingBy, row.PickBy, row.pickBy)
    String rowPgiDate = firstNonEmpty(
        row.PGIDate,
        row.pgiDate,
        row.PostGoodsIssueDate,
        row.postGoodsIssueDate,
        row.ActualGiDate,
        row.actualGiDate,
        row.PGIAt,
        row.pgiAt,
        row.GIAt,
        row.giAt
    )
    String rowPgiBy = firstNonEmpty(
        row.PGIBy,
        row.pgiBy,
        row.PostGoodsIssueBy,
        row.postGoodsIssueBy,
        row.GIBy,
        row.giBy
    )

    boolean rawMessageLooksError = looksLikeError(rawMessage)
    String itemMessage = rawMessage
    if (!itemMessage || (isSuccess && rawMessageLooksError)) {
        if (isSuccess) {
            if (rowPgi.code == "COMPLETED") {
                itemMessage = matDoc
                    ? "Picking + PGI completed for delivery ${deliveryDoc} (MatDoc ${matDoc})."
                    : "Picking + PGI completed for delivery ${deliveryDoc}."
            } else if (rowPicking.code == "COMPLETED" || rowPicking.code == "IN_PROGRESS") {
                itemMessage = "Picking completed for delivery ${deliveryDoc}, waiting PGI."
            } else {
                itemMessage = "Delivery ${deliveryDoc} sent to warehouse. Picking and PGI not started."
            }
        } else {
            itemMessage = "Failed to process picking/PGI for delivery ${deliveryDoc}"
        }
    }

    Map detailPayloadObject = [
        summary         : itemMessage,
        successCount    : isSuccess ? 1 : 0,
        errorCount      : isSuccess ? 0 : 1,
        resultsCount    : 1,
        itemCount       : detailItems.size(),
        deliveryStatus  : deliveryStatus,
        pickingStatus   : rowPicking.code,
        pickingStatusText: rowPicking.text,
        pgiStatus       : rowPgi.code,
        pgiStatusText   : rowPgi.text
    ]

    Map detailRow = [
        requestId          : requestId,
        quotationNo        : quotationNo,
        salesOrder         : salesOrder,
        deliveryDoc        : deliveryDoc,
        billingDoc         : "",
        callbackSource     : "WAREHOUSE",
        status             : callbackStatus,
        msgDesc            : itemMessage,
        deliveryStatus     : deliveryStatus,
        pickingStatus      : rowPicking.code,
        pickingStatusText  : rowPicking.text,
        pickingDate        : rowPickingDate,
        pickingBy          : rowPickingBy,
        pgiStatus          : rowPgi.code,
        pgiStatusText      : rowPgi.text,
        pgiDate            : rowPgiDate,
        pgiBy              : rowPgiBy,
        pgiDocument        : matDoc,
        itemCount          : detailItems.size(),
        payload            : JsonOutput.toJson(detailPayloadObject),
        ItItems            : detailItems
    ]

    Map callbackItem = [
        requestId          : requestId,
        quotationNo        : quotationNo,
        salesOrder         : salesOrder,
        deliveryDoc        : deliveryDoc,
        billingDoc         : "",
        status             : callbackStatus,
        callbackStatus     : callbackStatus,
        callbackStep       : callbackStep,
        message            : itemMessage,
        poNumber           : firstNonEmpty(returnRow?.poNumber),
        poItem             : firstNonEmpty(returnRow?.poItem),
        preqNo             : firstNonEmpty(returnRow?.preqNo),
        preqItem           : firstNonEmpty(returnRow?.preqItem)
    ]

    return [
        detail       : detailRow,
        callbackItem : callbackItem,
        isSuccess    : isSuccess
    ]
}

Map transformDeliveryLine(Map line, Map parentRow, String deliveryDoc, String currency, int fallbackIndex) {
    String itemNo = firstNonEmpty(line.ItemNo, line.itemNo, line.DeliveryItem, line.deliveryItem, String.format("%05d", fallbackIndex * 10))
    String material = firstNonEmpty(line.Material, line.material)
    String description = firstNonEmpty(line.MatDesc, line.matDesc, line.Description, line.description)

    String quantity = firstNonEmpty(
        line.Quantity,
        line.quantity,
        line.DlvQty,
        line.dlvQty,
        line.DeliveredQty,
        line.deliveredQty,
        line.PickQty,
        line.pickQty
    )
    String pickQty = firstNonEmpty(line.PickQty, line.pickQty)
    String unit = firstNonEmpty(line.SalesUnit, line.salesUnit, line.Unit, line.unit)

    String plant = firstNonEmpty(line.Plant, line.plant)
    String storLoc = firstNonEmpty(line.StorLoc, line.storLoc, line.StorageLocation, line.storageLocation)
    String deliveryDate = firstNonEmpty(line.DeliveryDate, line.deliveryDate, line.ReqDate, line.reqDate)

    String value = firstNonEmpty(line.ItemValue, line.itemValue, line.NetValue, line.netValue, line.NetPrice, line.netPrice)
    String lineCurrency = firstNonEmpty(line.Currency, line.currency, currency)
    String pgiDocument = firstNonEmpty(
        line.PGIDocument,
        line.pgiDocument,
        line.MaterialDocument,
        line.materialDocument,
        line.MatDoc,
        line.matDoc,
        parentRow.MatDoc,
        parentRow.matDoc
    )

    String pickingStatusRaw = firstNonEmpty(
        line.PickingStatus,
        line.pickingStatus,
        line.PickStatus,
        line.pickStatus,
        line.PickingState,
        line.pickingState,
        line.PickingDone,
        line.pickingDone,
        parentRow.PickingStatus,
        parentRow.pickingStatus,
        parentRow.PickStatus,
        parentRow.pickStatus,
        parentRow.PickingState,
        parentRow.pickingState,
        parentRow.PickingDone,
        parentRow.pickingDone
    )
    String pickingDate = firstNonEmpty(
        line.PickingDate,
        line.pickingDate,
        line.PickDate,
        line.pickDate,
        line.PickingAt,
        line.pickingAt,
        parentRow.PickingDate,
        parentRow.pickingDate,
        parentRow.PickDate,
        parentRow.pickDate,
        parentRow.PickingAt,
        parentRow.pickingAt
    )
    String pickingBy = firstNonEmpty(line.PickingBy, line.pickingBy, line.PickBy, line.pickBy)

    String pgiStatusRaw = firstNonEmpty(
        line.PGIStatus,
        line.pgiStatus,
        line.PostGoodsIssueStatus,
        line.postGoodsIssueStatus,
        line.GIStatus,
        line.giStatus,
        line.GiStatus,
        line.PGIState,
        line.pgiState,
        line.PgiDone,
        line.pgiDone,
        line.GiDone,
        parentRow.PGIStatus,
        parentRow.pgiStatus,
        parentRow.PostGoodsIssueStatus,
        parentRow.postGoodsIssueStatus,
        parentRow.GiStatus,
        parentRow.giStatus,
        parentRow.GIStatus,
        parentRow.PGIState,
        parentRow.pgiState,
        parentRow.PgiDone,
        parentRow.pgiDone,
        parentRow.GiDone
    )
    String pgiDate = firstNonEmpty(
        line.PGIDate,
        line.pgiDate,
        line.PostGoodsIssueDate,
        line.postGoodsIssueDate,
        line.ActualGiDate,
        line.actualGiDate,
        line.PGIAt,
        line.pgiAt,
        line.GIAt,
        line.giAt,
        parentRow.PGIDate,
        parentRow.pgiDate,
        parentRow.PostGoodsIssueDate,
        parentRow.postGoodsIssueDate,
        parentRow.ActualGiDate,
        parentRow.actualGiDate,
        parentRow.PGIAt,
        parentRow.pgiAt,
        parentRow.GIAt,
        parentRow.giAt
    )
    String pgiBy = firstNonEmpty(line.PGIBy, line.pgiBy, line.PostGoodsIssueBy, line.postGoodsIssueBy)

    Map picking = normalizeStageStatus(pickingStatusRaw, pickingDate)
    Map pgi = normalizeStageStatus(pgiStatusRaw, pgiDate)

    return [
        DocumentNo         : deliveryDoc,
        ItemNo             : itemNo,
        Material           : material,
        MatDesc            : description,
        Quantity           : quantity,
        SalesUnit          : unit,
        Plant              : plant,
        StorLoc            : storLoc,
        DeliveryDate       : deliveryDate,
        ItemValue          : value,
        Currency           : lineCurrency,
        PickingQty         : pickQty,
        DeliveryStatus     : deliveryDoc ? "DELIVERY_CREATED" : "DELIVERY_FAILED",
        PickingStatus      : picking.code,
        PickingStatusText  : picking.text,
        PickingDate        : pickingDate,
        PickingBy          : pickingBy,
        PGIStatus          : pgi.code,
        PGIStatusText      : pgi.text,
        PGIDate            : pgiDate,
        PGIBy              : pgiBy,
        PGIDocument        : pgiDocument,
        MaterialDocument   : pgiDocument
    ]
}

Map normalizeStageStatus(String rawStatus, String eventDate) {
    String raw = safeText(rawStatus)
    String upper = raw.toUpperCase()

    if (!upper) {
        if (safeText(eventDate)) {
            return [code: "COMPLETED", text: "Completed"]
        }
        return [code: "NOT_STARTED", text: "Not Started"]
    }

    if (upper in ["A"]) {
        return [code: "NOT_STARTED", text: "Not Started"]
    }

    if (upper in ["B"]) {
        return [code: "IN_PROGRESS", text: "In Progress"]
    }

    if (upper in ["C", "X", "S", "Y", "1", "TRUE", "T"]) {
        return [code: "COMPLETED", text: "Completed"]
    }

    if (upper in ["N", "0", "FALSE", "F"]) {
        return [code: "NOT_STARTED", text: "Not Started"]
    }

    if (upper in ["P", "R", "I", "W"]) {
        return [code: "IN_PROGRESS", text: "In Progress"]
    }

    if (upper ==~ /.*(NOT[_\s-]*START|NONE|N\/?A|INITIAL).*/) {
        return [code: "NOT_STARTED", text: "Not Started"]
    }

    if (upper ==~ /.*(FAIL|ERROR|REJECT|CANCEL|EXCEPTION).*/) {
        return [code: "FAILED", text: "Failed"]
    }

    if (upper ==~ /.*(IN[_\s-]*PROGRESS|RUNNING|PENDING|QUEUE|WAIT|PROCESSING|STARTED).*/) {
        return [code: "IN_PROGRESS", text: "In Progress"]
    }

    if (upper ==~ /.*(COMPLETE|COMPLETED|SUCCESS|DONE|POSTED|CONFIRMED|PICKED|PGI|ISSUED|FINISHED|OK).*/) {
        return [code: "COMPLETED", text: "Completed"]
    }

    String normalizedCode = upper.replaceAll(/[^A-Z0-9]+/, "_").replaceAll(/_+/, "_").replaceAll(/^_|_$/, "")
    String normalizedText = raw.replaceAll(/[_-]+/, " ").replaceAll(/\s+/, " ").trim()
    if (normalizedText) {
        normalizedText = normalizedText.substring(0, 1).toUpperCase() + normalizedText.substring(1).toLowerCase()
    }

    return [code: normalizedCode ?: "IN_PROGRESS", text: normalizedText ?: "In Progress"]
}

Map aggregateStage(List<Map> rows, String key) {
    List<String> codes = rows.collect { Map r -> safeText(pickMapValueIgnoreCase(r, key)).toUpperCase() }.findAll { it }
    if (codes.isEmpty()) {
        return [code: "NOT_STARTED", text: "Not Started"]
    }

    Set completedCodes = ["COMPLETED", "C", "X", "S", "DONE", "SUCCESS", "PGI_DONE"] as Set
    Set inProgressCodes = ["IN_PROGRESS", "P", "R", "I", "RUNNING", "PROCESSING"] as Set
    Set notStartedCodes = ["NOT_STARTED", "N", "0"] as Set

    if (codes.any { it == "FAILED" || it.contains("ERROR") }) {
        return [code: "FAILED", text: "Failed"]
    }

    if (codes.every { completedCodes.contains(it) }) {
        return [code: "COMPLETED", text: "Completed"]
    }

    if (codes.any { inProgressCodes.contains(it) || it.contains("PROGRESS") }
        || (codes.any { completedCodes.contains(it) } && codes.any { notStartedCodes.contains(it) })) {
        return [code: "IN_PROGRESS", text: "In Progress"]
    }

    if (codes.any { completedCodes.contains(it) }) {
        return [code: "IN_PROGRESS", text: "In Progress"]
    }

    return [code: "NOT_STARTED", text: "Not Started"]
}

String resolveRowCallbackStep(Map rowPgi, Map rowPicking) {
    String pgiCode = safeText(rowPgi?.code).toUpperCase()
    String pickingCode = safeText(rowPicking?.code).toUpperCase()

    if (pgiCode == "COMPLETED") {
        return "Warehouse PGI: Completed"
    }
    if (pickingCode == "COMPLETED") {
        return "Warehouse Picking: Completed"
    }
    if (pickingCode == "IN_PROGRESS") {
        return "Warehouse Picking: In Progress"
    }
    return "Warehouse Picking: Not Started"
}

String resolveRowCallbackStatus(Map rowPgi, Map rowPicking) {
    if ((rowPgi.code ?: "") == "COMPLETED") {
        return "PGI_COMPLETED"
    }
    if ((rowPicking.code ?: "") in ["COMPLETED", "IN_PROGRESS"]) {
        return "PICKING_IN_PROGRESS"
    }
    return "PICKING_PENDING"
}

String resolveOverallCallbackStatus(int errorCount, int successCount, Map overallPgi, Map overallPicking) {
    if (errorCount > 0 && successCount > 0) {
        return "PARTIAL"
    }

    if (errorCount > 0 && successCount <= 0) {
        return "ERROR"
    }

    if ((overallPgi.code ?: "") == "COMPLETED") {
        return "PGI_COMPLETED"
    }

    if ((overallPicking.code ?: "") in ["COMPLETED", "IN_PROGRESS"]) {
        return "PICKING_IN_PROGRESS"
    }

    return "PICKING_PENDING"
}

String buildOverallMessage(int successCount, int errorCount, Map overallPicking, Map overallPgi) {
    String base = "Processed outbound delivery callback: success=${successCount}, error=${errorCount}"
    String detail = "Picking=${overallPicking.text}, PGI=${overallPgi.text}"
    return base + " | " + detail
}

boolean looksLikeError(String status) {
    String upper = safeText(status).toUpperCase()
    if (!upper) {
        return false
    }

    Set<String> exactErrorCodes = [
        "E",
        "ERR",
        "ERROR",
        "FAIL",
        "FAILED",
        "REJECT",
        "REJECTED",
        "CANCEL",
        "CANCELLED",
        "EXCEPTION",
        "ABORTED"
    ] as Set

    if (exactErrorCodes.contains(upper)) {
        return true
    }

    return upper ==~ /.*(FAIL|ERROR|REJECT|CANCEL|EXCEPTION|ABORT).*/
}

Map buildFallbackErrorRow(String reason) {
    String message = firstNonEmpty(reason, "Outbound delivery callback failed")

    Map detail = [
        requestId          : "",
        quotationNo        : "",
        salesOrder         : "",
        deliveryDoc        : "",
        billingDoc         : "",
        status             : "ERROR",
        msgDesc            : message,
        deliveryStatus     : "DELIVERY_FAILED",
        pickingStatus      : "NOT_STARTED",
        pickingStatusText  : "Not Started",
        pgiStatus          : "NOT_STARTED",
        pgiStatusText      : "Not Started",
        itemCount          : 1,
        ItItems            : [[
            DocumentNo        : "",
            ItemNo            : "00010",
            Material          : "",
            MatDesc           : "",
            Quantity          : "",
            SalesUnit         : "",
            Plant             : "",
            StorLoc           : "",
            DeliveryDate      : "",
            ItemValue         : "",
            Currency          : "",
            DeliveryStatus    : "DELIVERY_FAILED",
            PickingStatus     : "NOT_STARTED",
            PickingStatusText : "Not Started",
            PGIStatus         : "NOT_STARTED",
            PGIStatusText     : "Not Started"
        ]]
    ]

    Map callbackItem = [
        requestId          : "",
        quotationNo        : "",
        salesOrder         : "",
        deliveryDoc        : "",
        billingDoc         : "",
        callbackSource     : "WAREHOUSE",
        status             : "ERROR",
        callbackStatus     : "ERROR",
        callbackStep       : "IF_DCAP_O2C_ProcessOutboundDelivery: Failed",
        message            : message,
        itemCount          : 1,
        deliveryStatus     : "DELIVERY_FAILED",
        pickingStatus      : "NOT_STARTED",
        pickingDate        : "",
        pickingBy          : "",
        pgiStatus          : "NOT_STARTED",
        pgiDate            : "",
        pgiBy              : "",
        pgiDocument        : "",
        payload            : JsonOutput.toJson([results: [detail], summary: message]),
        poNumber           : "",
        poItem             : "",
        preqNo             : "",
        preqItem           : ""
    ]

    return [detail: detail, callbackItem: callbackItem]
}

String firstNonEmpty(Object... values) {
    for (Object value : values) {
        String text = safeText(value)
        if (text) {
            return text
        }
    }
    return ""
}
