import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.util.XmlSlurper
import java.io.Reader
import java.io.StringReader

def pick(Object... vals) {
    for (def v : vals) {
        def s = (v == null) ? "" : String.valueOf(v).trim()
        if (s) return s
    }
    return ""
}

def firstPresent(Object... vals) {
    for (def v : vals) {
        if (v == null) continue
        if (v instanceof String) {
            if (String.valueOf(v).trim()) return v
        } else {
            return v
        }
    }
    return null
}

def localName(def n) {
    def s = String.valueOf(n ?: "")
    return s.contains(":") ? s.substring(s.indexOf(":") + 1) : s
}

def readBodyText(Reader reader) {
    if (reader == null) return ""
    StringBuilder sb = new StringBuilder()
    char[] buf = new char[4096]
    int n = 0
    try {
        while ((n = reader.read(buf)) > -1) {
            sb.append(buf, 0, n)
        }
    } finally {
        try { reader.close() } catch (Exception ignored) {}
    }
    return sb.toString()
}

def parseJsonFromReader(Reader reader) {
    if (reader == null) return [:]
    try {
        def obj = new JsonSlurper().parse(reader)
        return (obj instanceof Map) ? obj : [:]
    } catch (Exception ignored) {
        return [:]
    } finally {
        try { reader.close() } catch (Exception ignored2) {}
    }
}

def parseJsonFromAny(def value) {
    if (value == null) return [:]
    if (value instanceof Map) return value
    if (value instanceof Reader) return parseJsonFromReader((Reader) value)

    try {
        def txt = String.valueOf(value)
        if (!txt?.trim()) return [:]
        def obj = new JsonSlurper().parse(new StringReader(txt))
        return (obj instanceof Map) ? obj : [:]
    } catch (Exception ignored) {
        return [:]
    }
}

def asList(def v) {
    if (v instanceof List) return v
    if (v instanceof Map) {
        if (v.item instanceof List) return v.item
        if (v.item instanceof Map) return [v.item]
        if (v.Item instanceof List) return v.Item
        if (v.Item instanceof Map) return [v.Item]
        return [v]
    }
    if (v == null) return []
    return [v]
}

def findNodeByName(def obj, String target) {
    if (obj instanceof Map) {
        for (def e : obj.entrySet()) {
            if (localName(e.key).equalsIgnoreCase(target)) return e.value
            def nested = findNodeByName(e.value, target)
            if (nested != null) return nested
        }
    } else if (obj instanceof List) {
        for (def it : obj) {
            def nested = findNodeByName(it, target)
            if (nested != null) return nested
        }
    }
    return null
}

def findQuotationBySo(String soNo, Map soQuotationMap) {
    if (!(soQuotationMap instanceof Map) || soQuotationMap.isEmpty()) return ""
    def so = pick(soNo)
    if (!so) return ""
    def soNoZero = so.replaceFirst("^0+", "")
    def soPad10 = so.padLeft(10, '0')
    return pick(soQuotationMap[so], soQuotationMap[soNoZero], soQuotationMap[soPad10])
}

def isErrorStatus(String st) {
    def s = pick(st).toUpperCase()
    return (s == "E" || s.contains("ERROR") || s.contains("FAIL") || s.contains("REJECT"))
}

def isSuccessStatus(String st) {
    def s = pick(st).toUpperCase()
    return (s == "S" || s == "SUCCESS" || s == "COMPLETED" || s == "CREATED")
}

def mapBillingState(String statusRaw, String retMsgType, String billingDoc) {
    def st = pick(statusRaw, retMsgType).toUpperCase()

    if (isErrorStatus(st)) {
        return [itemStatus: "ERROR", step: "IF_DCAP_O2C_CreateBillingDocument: Failed"]
    }

    if (pick(billingDoc) && (isSuccessStatus(st) || !st)) {
        return [itemStatus: "SUCCESS", step: "IF_DCAP_O2C_CreateBillingDocument: Completed"]
    }

    return [itemStatus: "RUNNING", step: "IF_DCAP_O2C_CreateBillingDocument: In Progress"]
}

def buildItemMessage(String batchId, String itemStatus, String soNo, String dlNo, String bilNo, String fallback) {
    def so = pick(soNo, "N/A")
    def dl = pick(dlNo, "N/A")
    def bl = pick(bilNo, "N/A")

    if ("ERROR".equalsIgnoreCase(itemStatus)) {
        return pick(
            fallback,
            (batchId ? "${batchId}: Billing failed for Delivery ${dl} (SO ${so})." : "Billing failed for Delivery ${dl} (SO ${so}).")
        )
    }

    if ("SUCCESS".equalsIgnoreCase(itemStatus)) {
        def core = "Billing ${bl} created from Delivery ${dl} (SO ${so})"
        return batchId ? "${batchId}: ${core}" : core
    }

    return batchId
        ? "${batchId}: Billing is processing for Delivery ${dl} (SO ${so})."
        : "Billing is processing for Delivery ${dl} (SO ${so})."
}

def mapValue(def source, String... names) {
    if (source == null) return ""
    for (def name : names) {
        try {
            def value = source?."${name}"
            def text = readValue(value)
            if (text) return text
        } catch (Exception ignored) {
        }
    }
    return ""
}

def readValue(def value) {
    if (value == null) return ""
    try {
        return pick(value.text())
    } catch (Exception ignored) {
        return pick(value)
    }
}

def extractItemChildren(def node) {
    if (node == null) return []

    try {
        def children = node.children()
        if (children != null) {
            def xmlItems = children.findAll { localName(it.name()).equalsIgnoreCase("item") }
            if (xmlItems && !xmlItems.isEmpty()) {
                return xmlItems
            }
        }
    } catch (Exception ignored) {
    }

    if (node instanceof Map) {
        def candidate = node.item ?: node.Item ?: node.items ?: node.Items ?: node
        return asList(candidate)
    }

    if (node instanceof List) {
        return node
    }

    return asList(node)
}

def buildBillingItem(def source, String billingDoc, String billingDate, String billingType, String parentCurrency) {
    def itemBillingDoc = firstPresent(
        mapValue(source, "BillingDoc", "BillingDocument", "billingDoc", "billing", "DocumentNo", "documentNo"),
        billingDoc
    )
    def itemCurrency = firstPresent(
        mapValue(source, "Currency", "currency", "waers"),
        parentCurrency
    )
    def itemBillingDate = firstPresent(mapValue(source, "BillingDate", "billingDate"), billingDate)
    def itemBillingType = firstPresent(mapValue(source, "BillingType", "billingType", "InvoiceType", "invoiceType"), billingType)
    def itemQty = firstPresent(
        mapValue(source, "BilledQty", "billedQty", "BillingQty", "billingQty", "Quantity", "quantity"),
        ""
    )
    def itemNo = mapValue(source, "ItemNo", "itemNo", "Item", "item", "lineNo", "lineItem")
    def material = mapValue(source, "Material", "material", "Matnr", "matnr")
    def matDesc = mapValue(source, "MatDesc", "matDesc", "Description", "description", "ShortText", "shortText")
    def salesUnit = mapValue(source, "SalesUnit", "salesUnit", "Unit", "unit")
    def netValue = mapValue(source, "NetValue", "netValue", "ItemValue", "itemValue", "NetPrice", "netPrice")
    def taxAmount = mapValue(source, "TaxAmount", "taxAmount")
    def grossValue = mapValue(source, "GrossValue", "grossValue")
    def totalAmount = mapValue(source, "TotalAmount", "totalAmount", "GrossValue", "grossValue")
    def plant = mapValue(source, "Plant", "plant")
    def storLoc = mapValue(source, "StorLoc", "storLoc", "StorageLoc", "storageLocation", "lgort")

    return [
        DocumentNo  : itemBillingDoc,
        documentNo  : itemBillingDoc,
        BillingDoc  : itemBillingDoc,
        BillingDocument: itemBillingDoc,
        ItemNo      : itemNo,
        itemNo      : itemNo,
        Material    : material,
        material    : material,
        MatDesc     : matDesc,
        matDesc     : matDesc,
        Description : matDesc,
        description : matDesc,
        BilledQty   : itemQty,
        Quantity    : itemQty,
        quantity    : itemQty,
        SalesUnit   : salesUnit,
        salesUnit   : salesUnit,
        NetValue    : netValue,
        netValue    : netValue,
        TaxAmount   : taxAmount,
        taxAmount   : taxAmount,
        GrossValue  : grossValue,
        grossValue  : grossValue,
        TotalAmount : totalAmount,
        totalAmount : totalAmount,
        Currency    : itemCurrency,
        currency    : itemCurrency,
        BillingDate : itemBillingDate,
        billingDate : itemBillingDate,
        BillingType : itemBillingType,
        billingType : itemBillingType,
        Plant       : plant,
        plant       : plant,
        StorLoc     : storLoc,
        storageLocation: storLoc
    ]
}

def buildBillingResultRow(def source, String batchId, Map soQuotationMap, Map returnMap) {
    def requestId = mapValue(source, "BlReqId", "BL_REQ_ID", "requestId", "RequestId")
    def lookupKey = firstPresent(requestId, mapValue(source, "Items", "items"))
    def deliveryNo = mapValue(source, "DeliveryNo", "deliveryNo", "DeliveryDocument", "deliveryDoc", "Delivery")
    def soNumber = mapValue(source, "SoNumber", "SalesOrder", "salesOrder")
    def billingDoc = mapValue(source, "BillingDoc", "BillingDocument", "billingDoc", "billing", "Invoice")
    def billingType = mapValue(source, "BillingType", "billingType")
    def billingDate = mapValue(source, "BillingDate", "billingDate")
    def netValue = mapValue(source, "NetValue", "netValue")
    def taxAmount = mapValue(source, "TaxAmount", "taxAmount")
    def grossValue = mapValue(source, "GrossValue", "grossValue")
    def totalAmount = mapValue(source, "TotalAmount", "totalAmount")
    def currency = mapValue(source, "Currency", "currency")
    def soldTo = mapValue(source, "SoldTo", "soldTo", "CustomerId", "customerId")
    def soldToName = mapValue(source, "SoldToName", "soldToName", "CustomerName", "customerName")
    def itemCount = mapValue(source, "ItemCount", "itemCount")
    def statusRaw = mapValue(source, "Status", "status")
    def returnRow = returnMap[lookupKey] ?: returnMap[requestId] ?: returnMap["SUMMARY"]
    def state = mapBillingState(statusRaw, returnRow?.msgType, billingDoc)
    def msgRaw = pick(mapValue(source, "Message", "message"), returnRow?.msgDesc)

    def itemNodes = extractItemChildren(source?.ItItems ?: source?.itItems ?: source?.items)
    def lineItems = []
    itemNodes.each { item ->
        lineItems << buildBillingItem(item, billingDoc, billingDate, billingType, currency)
    }

    if (!billingDoc && !lineItems.isEmpty()) {
        billingDoc = firstPresent(lineItems[0]?.DocumentNo, lineItems[0]?.documentNo)
    }

    def summaryRow = [
        batchId       : batchId,
        quotationNo   : findQuotationBySo(soNumber, soQuotationMap),
        salesOrder    : soNumber,
        deliveryDoc   : deliveryNo,
        billingDoc    : billingDoc,
        status        : state.itemStatus,
        callbackStatus: state.itemStatus,
        callbackStep  : state.step,
        message       : buildItemMessage(batchId, state.itemStatus, soNumber, deliveryNo, billingDoc, msgRaw),
        requestId     : requestId
    ]

    def detailRow = [
        BlReqId       : requestId,
        DeliveryNo    : deliveryNo,
        SoNumber      : soNumber,
        BillingDoc    : billingDoc,
        BillingDocument: billingDoc,
        BillingType   : billingType,
        BillingDate   : billingDate,
        NetValue      : netValue,
        TaxAmount     : taxAmount,
        GrossValue    : grossValue,
        TotalAmount   : totalAmount,
        Currency      : currency,
        SoldTo        : soldTo,
        SoldToName    : soldToName,
        ItemCount     : itemCount,
        Status        : state.itemStatus,
        Message       : msgRaw,
        ItItems       : [item: lineItems]
    ]

    return [
        summaryRow   : summaryRow,
        detailRow    : detailRow,
        lineItems    : lineItems,
        summaryMessage: msgRaw,
        requestId    : requestId,
        billingDoc   : billingDoc,
        status       : state.itemStatus,
        step         : state.step
    ]
}

def buildRowsFromXml(String xmlText, String batchId, Map soQuotationMap) {
    def rows = []
    def detailRows = []
    def returnRows = []
    def summaryMsg = ""

    def xml = new XmlSlurper(false, false).parseText(xmlText)

    def etReturnNode = xml.depthFirst().find { localName(it.name()).equalsIgnoreCase("EtReturn") }
    def retItems = extractItemChildren(etReturnNode)
    def retMap = [:]
    retItems.each { r ->
        def key = mapValue(r, "Items", "items")
        def msgType = pick(mapValue(r, "MsgType", "msgType"), mapValue(r, "Status", "status"))
        def msgDesc = pick(mapValue(r, "MsgDesc", "msgDesc", "Message", "message"))
        if (key) {
            retMap[key] = [msgType: msgType, msgDesc: msgDesc]
            returnRows << [Items: key, MsgType: msgType, MsgDesc: msgDesc]
        }
    }
    summaryMsg = pick(retMap["SUMMARY"]?.msgDesc)

    def etResultsNode = xml.depthFirst().find { localName(it.name()).equalsIgnoreCase("EtResults") }
    def resultItems = extractItemChildren(etResultsNode)
    resultItems.each { r ->
        def built = buildBillingResultRow(r, batchId, soQuotationMap, retMap)
        rows << built.summaryRow
        detailRows << built.detailRow
        if (!summaryMsg) {
            summaryMsg = pick(built.summaryMessage)
        }
    }

    return [
        rows: rows,
        summaryMsg: summaryMsg,
        detailPayload: [
            summary     : summaryMsg,
            results     : detailRows,
            returns     : returnRows,
            callbackSource: "BILLING"
        ]
    ]
}

def buildRowsFromJson(Map rootMap, String batchId, Map soQuotationMap) {
    def rows = []
    def detailRows = []
    def returnRows = []
    def summaryMsg = ""

    def retNode = findNodeByName(rootMap, "EtReturn") ?: findNodeByName(rootMap, "etReturn") ?: rootMap.returns ?: rootMap.Returns
    def retItems = extractItemChildren(retNode)
    def retMap = [:]
    retItems.each { r ->
        def key = mapValue(r, "Items", "items")
        def msgType = pick(mapValue(r, "MsgType", "msgType"), mapValue(r, "Status", "status"))
        def msgDesc = pick(mapValue(r, "MsgDesc", "msgDesc", "Message", "message"))
        if (key) {
            retMap[key] = [msgType: msgType, msgDesc: msgDesc]
            returnRows << [Items: key, MsgType: msgType, MsgDesc: msgDesc]
        }
    }
    summaryMsg = pick(retMap["SUMMARY"]?.msgDesc)

    def resultsNode = findNodeByName(rootMap, "EtResults") ?: findNodeByName(rootMap, "etResults") ?: rootMap.results ?: rootMap.EtResults
    def resultItems = extractItemChildren(resultsNode)
    resultItems.each { r ->
        def built = buildBillingResultRow(r, batchId, soQuotationMap, retMap)
        rows << built.summaryRow
        detailRows << built.detailRow
        if (!summaryMsg) {
            summaryMsg = pick(built.summaryMessage)
        }
    }

    return [
        rows: rows,
        summaryMsg: summaryMsg,
        detailPayload: [
            summary     : summaryMsg,
            results     : detailRows,
            returns     : returnRows,
            callbackSource: "BILLING"
        ]
    ]
}

Message processData(Message message) {
    def props = message.getProperties()
    def headers = message.getHeaders()

    def rawBody = readBodyText(message.getBody(java.io.Reader))
    def bodyText = pick(rawBody)

    def deliveryDocsObj = parseJsonFromAny(firstPresent(
        props.get("deliveryDocs"),
        props.get("delivery_docs"),
        props.get("deliveryData"),
        props.get("warehouseContext")
    ))
    def ctx = (deliveryDocsObj.context instanceof Map) ? deliveryDocsObj.context : [:]

    def batchId = pick(
        ctx.batchID,
        ctx.batchId,
        props.get("batchID"),
        props.get("batchId"),
        headers.get("SAP_MessageProcessingLogID"),
        headers.get("sap_messageprocessinglogid")
    )

    def soQuotationMap = parseJsonFromAny(props.get("soQuotationMap"))

    def parsed = [rows: [], summaryMsg: "", detailPayload: [summary: "", results: [], returns: [], callbackSource: "BILLING"]]
    if (bodyText.startsWith("{") || bodyText.startsWith("[")) {
        parsed = buildRowsFromJson(parseJsonFromAny(bodyText), batchId, soQuotationMap)
    } else {
        parsed = buildRowsFromXml(bodyText, batchId, soQuotationMap)
    }

    def rows = parsed.rows ?: []
    def summaryMsg = pick(parsed.summaryMsg)

    if (!rows || rows.isEmpty()) {
        def deliveryData = (ctx.deliveryData instanceof Map) ? ctx.deliveryData : [:]
        def soNo = pick(deliveryData.soNumber, props.get("salesOrder"), props.get("soNumber"))
        def dlNo = pick(deliveryData.deliveryNo, props.get("deliveryDoc"), props.get("deliveryNo"))
        def blNo = pick(props.get("billingDoc"), props.get("billingNo"), props.get("BillingDocument"))
        def qNo = pick(deliveryData.quotationNo, props.get("quotationNo"), findQuotationBySo(soNo, soQuotationMap))
        def fallbackStatus = blNo ? "SUCCESS" : "RUNNING"
        def fallbackStep = blNo ? "IF_DCAP_O2C_CreateBillingDocument: Completed" : "IF_DCAP_O2C_CreateBillingDocument: In Progress"

        rows = [[
            batchId       : batchId,
            quotationNo   : qNo,
            salesOrder    : soNo,
            deliveryDoc   : dlNo,
            billingDoc    : blNo,
            status        : fallbackStatus,
            callbackStatus: fallbackStatus,
            callbackStep  : fallbackStep,
            message       : buildItemMessage(batchId, fallbackStatus, soNo, dlNo, blNo, ""),
            requestId     : ""
        ]]
    }

    int successCount = rows.count { String.valueOf(it.callbackStatus).equalsIgnoreCase("SUCCESS") }
    int runningCount = rows.count { String.valueOf(it.callbackStatus).equalsIgnoreCase("RUNNING") }
    int errorCount = rows.count { String.valueOf(it.callbackStatus).equalsIgnoreCase("ERROR") }

    def overallStatus = "RUNNING"
    def overallStep = "IF_DCAP_O2C_CreateBillingDocument: In Progress"
    def capRoute = "OK"

    if (errorCount > 0 && successCount == 0 && runningCount == 0) {
        overallStatus = "ERROR"
        overallStep = "IF_DCAP_O2C_CreateBillingDocument: Failed"
        capRoute = "FAIL"
    } else if (errorCount > 0) {
        overallStatus = "PARTIAL"
        overallStep = "IF_DCAP_O2C_CreateBillingDocument: Partial"
        capRoute = "FAIL"
    } else if (runningCount > 0) {
        overallStatus = "RUNNING"
        overallStep = "IF_DCAP_O2C_CreateBillingDocument: In Progress"
        capRoute = "OK"
    } else {
        overallStatus = "SUCCESS"
        overallStep = "IF_DCAP_O2C_CreateBillingDocument: Completed"
        capRoute = "OK"
    }

    def wfObj = parseJsonFromAny(firstPresent(
        props.get("billingWorkflowResult"),
        props.get("warehouseWorkflowResult"),
        props.get("salesApproverResult")
    ))
    def workflowInstanceId = pick(
        wfObj.id,
        wfObj.rootInstanceId,
        props.get("workflowInstanceId"),
        headers.get("SAP_WorkflowInstanceId")
    )

    def top = rows[0] ?: [:]
    def detailPayload = (parsed.detailPayload instanceof Map) ? parsed.detailPayload : [:]
    detailPayload.callbackStatus = overallStatus
    detailPayload.callbackStep = overallStep
    detailPayload.batchId = batchId
    detailPayload.billingDoc = pick(top.billingDoc, top.BillingDoc, props.get("billingDoc"), props.get("BillingDocument"))

    def callbackPayload = [
        batchId           : batchId,
        quotationNo       : pick(top.quotationNo),
        salesOrder        : pick(top.salesOrder),
        deliveryDoc       : pick(top.deliveryDoc),
        billingDoc        : pick(top.billingDoc),
        callbackSource    : "BILLING",
        callbackStatus    : overallStatus,
        callbackStep      : overallStep,
        workflowInstanceId: workflowInstanceId,
        message           : pick(
            summaryMsg,
            (successCount > 0 ? "${successCount} billing(s) created successfully" : ""),
            (runningCount > 0 ? "Billing processing is running" : ""),
            (errorCount > 0 ? "${errorCount} billing request(s) failed" : "")
        ),
        payload           : JsonOutput.toJson(detailPayload),
        items             : rows
    ]

    message.setProperty("capRoute", capRoute)
    message.setProperty("overallStatus", overallStatus)

    message.setHeader("CamelHttpMethod", "POST")
    message.setHeader("Content-Type", "application/json")
    message.setHeader("Accept", "application/json")
    message.setBody(JsonOutput.toJson(callbackPayload))
    return message
}
