import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput
import groovy.util.XmlSlurper

def pick(Object... vals) {
    for (def v : vals) {
        def s = v == null ? "" : String.valueOf(v).trim()
        if (s) return s
    }
    return ""
}

def lname(def n) {
    def s = String.valueOf(n ?: "")
    return s.contains(":") ? s.substring(s.indexOf(":") + 1) : s
}

def normStatus(String raw) {
    def s = (raw ?: "").trim().toUpperCase()
    if (!s) return "SUCCESS"
    if (s in ["S", "SUCCESS", "COMPLETED"]) return "SUCCESS"
    if (s == "E" || s.contains("ERROR") || s.contains("FAIL") || s.contains("REJECT")) return "ERROR"
    if (s == "W" || s.contains("RUNNING") || s.contains("PENDING") || s.contains("PROCESS") || s.contains("QUEUE")) return "RUNNING"
    return "RUNNING"
}

def stepByStatus(String st) {
    if (st == "SUCCESS") return "Create Quotation Completed"
    if (st == "ERROR") return "Create Quotation Failed"
    return "Create Quotation In Progress"
}

def toCallbackStatus(String st) {
    if (st == "SUCCESS") return "SALES_APPROVED"
    if (st == "ERROR") return "ERROR"
    return "RUNNING"
}

def overallStatus(int success, int error, int running) {
    if (error > 0 && success == 0 && running == 0) return "ERROR"
    if (error > 0) return "PARTIAL"
    if (running > 0) return "RUNNING"
    if (success > 0) return "SALES_APPROVED"
    return "RUNNING"
}

def extractCreatedDocFromText(String text) {
    def s = pick(text)
    if (!s) return ""
    def m = (s =~ /(?i)\bQuotation\s+([A-Z0-9_\-\/]+)/)
    if (m.find()) return pick(m.group(1))
    return ""
}

def isRequestLikeCode(String value) {
    def s = pick(value).toUpperCase()
    return s ==~ /^(REQ|QTREQ|REQUEST)[A-Z0-9_\-]*$/
}

def normalizeQuotationNo(String value, String status) {
    def q = pick(value)
    if (status == "ERROR" && (!q || isRequestLikeCode(q))) {
        return "UNKNOWN"
    }
    return pick(q, "UNKNOWN")
}

def unknownWhenFailed(String value, String status) {
    return status == "ERROR" ? pick(value, "Unknown") : pick(value)
}

def errorMessagesFromReturns(List retItems, String key) {
    def normalizedKey = pick(key).toUpperCase()
    def rows = (retItems ?: []).findAll { rr ->
        !String.valueOf(rr.items).equalsIgnoreCase("SUMMARY") &&
        (!normalizedKey || pick(rr.items).toUpperCase() == normalizedKey) &&
        normStatus(pick(rr.msgType)) == "ERROR" &&
        pick(rr.msgDesc)
    }
    return rows.collect { it.msgDesc }.unique().join(" | ")
}

def itemMessage(String batchId, String quotationNo, String status, String fallbackMsg) {
    def b = pick(batchId)
    def q = pick(quotationNo, "UNKNOWN")
    if (status == "SUCCESS") {
        return b ? "${b}: Quotation ${q} created successfully." : "Quotation ${q} created successfully."
    }
    if (status == "RUNNING") {
        return b ? "${b}: Quotation ${q} is processing." : "Quotation ${q} is processing."
    }
    return pick(fallbackMsg, (b ? "${b}: Quotation ${q} failed." : "Quotation ${q} failed."))
}

def normalizeLineItem(def raw) {
    def it = raw ?: [:]
    return [
        ItemNo      : pick(it.ItemNo?.text(), it.itemNo?.text(), it.ItemNo, it.itemNo),
        Material    : pick(it.Material?.text(), it.material?.text(), it.Material, it.material),
        MatDesc     : pick(it.MatDesc?.text(), it.matDesc?.text(), it.Description?.text(), it.MatDesc, it.matDesc, it.description),
        Quantity    : pick(it.Quantity?.text(), it.quantity?.text(), it.Quantity, it.quantity),
        SalesUnit   : pick(it.SalesUnit?.text(), it.salesUnit?.text(), it.Unit?.text(), it.SalesUnit, it.salesUnit, it.unit),
        NetPrice    : pick(it.NetPrice?.text(), it.netPrice?.text(), it.NetPrice, it.netPrice),
        ItemValue   : pick(it.ItemValue?.text(), it.itemValue?.text(), it.ItemValue, it.itemValue),
        Plant       : pick(it.Plant?.text(), it.plant?.text(), it.Plant, it.plant),
        StorLoc     : pick(it.StorLoc?.text(), it.storLoc?.text(), it.StorageLocation?.text(), it.storageLocation?.text(), it.StorLoc, it.storLoc),
        DeliveryDate: pick(it.DeliveryDate?.text(), it.deliveryDate?.text(), it.DelivDate?.text(), it.delivDate?.text(), it.DeliveryDate, it.deliveryDate),
        ShipPoint   : pick(it.ShipPoint?.text(), it.shipPoint?.text(), it.ShippingPoint?.text(), it.shippingPoint?.text(), it.ShipPoint, it.shipPoint),
        Currency    : pick(it.Currency?.text(), it.currency?.text(), it.Currency, it.currency)
    ]
}

Message processData(Message message) {
    // Keep FAIL as default to avoid wrong route when unexpected error happens.
    message.setProperty("capRoute", "FAIL")

    def body = message.getBody(String) ?: ""
    def props = message.getProperties()
    def headers = message.getHeaders()

    // Get fileType from header (passed from original upload)
    def fileType = pick(
        headers.get("fileType"),
        headers.get("x-file-type"),
        headers.get("uploadType"),
        props.get("fileType")
    )
    
    // ========== LẤY REQUESTER EMAIL TỪ HEADER ==========
    def requesterEmail = pick(
        headers.get("requesterEmail"),
        headers.get("x-requester-email"),
        headers.get("RequesterEmail"),
        props.get("requesterEmail"),
        props.get("RequesterEmail")
    )
    // Nếu không có trong header, thử lấy từ properties hoặc message headers khác
    if (!requesterEmail) {
        // Lấy từ message properties nếu được set trước đó
        requesterEmail = pick(
            message.getProperty("requesterEmail"),
            message.getProperty("RequesterEmail")
        )
    }

    def batchId = pick(
        props.get("batchId"),
        headers.get("SAP_MessageProcessingLogID"),
        headers.get("sap_messageprocessinglogid")
    )
    def workflowInstanceId = pick(props.get("workflowInstanceId"), headers.get("SAP_WorkflowInstanceId"))

    try {
        def x = new XmlSlurper(false, false).parseText(body)

        // FIX CỰC MẠNH: Thay vì dùng collectMany gây lỗi ép kiểu, dùng vòng lặp each nhét vào List thủ công
        def allEtReturnItems = []
        x.depthFirst().findAll { lname(it.name()).equalsIgnoreCase("EtReturn") }.each { etNode ->
            etNode.children().findAll { lname(it.name()).equalsIgnoreCase("item") }.each { itemNode ->
                allEtReturnItems << itemNode
            }
        }
        
        def allEtResultsItems = []
        x.depthFirst().findAll { lname(it.name()).equalsIgnoreCase("EtResults") }.each { etNode ->
            etNode.children().findAll { lname(it.name()).equalsIgnoreCase("item") }.each { itemNode ->
                allEtResultsItems << itemNode
            }
        }

        def retItems = allEtReturnItems.collect { r ->
            [
                items  : pick(r.Items?.text(), r.items?.text()),
                msgType: normStatus(pick(r.MsgType?.text(), r.msgType?.text())),
                msgDesc: pick(r.MsgDesc?.text(), r.msgDesc?.text(), r.Message?.text(), r.message?.text())
            ]
        }

        def retByKey = [:]
        retItems.each { rr ->
            def k = pick(rr.items).toUpperCase()
            if (k && !retByKey.containsKey(k)) retByKey[k] = rr
        }

        def summaryNodes = retItems.findAll { String.valueOf(it.items).equalsIgnoreCase("SUMMARY") }
        def summaryMsg = summaryNodes ? summaryNodes.collect { it.msgDesc }.join(" | ") : ""

        def items = []
        def detailResults = []

        if (allEtResultsItems && allEtResultsItems.size() > 0) {
            allEtResultsItems.each { r ->
                def reqKey = pick(
                    r.QtReqId?.text(),
                    r."QT_REQ_ID"?.text(),
                    r.PurchNoC?.text(),
                    r.purchNoC?.text()
                )

                def rawMsg = pick(r.Message?.text(), r.message?.text())
                def quotationNo = pick(
                    r.QuotationNo?.text(),
                    r.quotationNo?.text(),
                    r.Quotation?.text(),
                    extractCreatedDocFromText(rawMsg)
                )
                def ret = retByKey[pick(reqKey, quotationNo).toUpperCase()]
                if (!ret) ret = retByKey[pick(quotationNo).toUpperCase()]

                def st = normStatus(pick(r.Status?.text(), r.status?.text(), ret?.msgType))
                def cbSt = toCallbackStatus(st)
                def displayQuotationNo = st == "ERROR" ? normalizeQuotationNo(quotationNo, st) : pick(quotationNo, reqKey, "UNKNOWN")
                def msg = itemMessage(batchId, displayQuotationNo, st, pick(rawMsg, errorMessagesFromReturns(retItems, pick(reqKey, quotationNo)), ret?.msgDesc, summaryMsg))

                def itItemsNode = r.ItItems ?: r.itItems
                def lineItems = []
                if (itItemsNode) {
                    lineItems = itItemsNode.children()
                        .findAll { lname(it.name()).equalsIgnoreCase("item") }
                        .collect { normalizeLineItem(it) }
                        .findAll { li -> pick(li.ItemNo, li.Material, li.MatDesc, li.Quantity, li.ItemValue) }
                }

                def detail = [
                    quotationNo   : displayQuotationNo,
                    status        : cbSt,
                    callbackStatus: cbSt,
                    callbackStep  : stepByStatus(st),
                    message       : msg,
                    soldTo        : unknownWhenFailed(pick(r.SoldTo?.text(), r.soldTo?.text()), st),
                    soldToName    : unknownWhenFailed(pick(r.SoldToName?.text(), r.soldToName?.text()), st),
                    purchNoC      : pick(r.PurchNoC?.text(), r.purchNoC?.text()),
                    netValue      : pick(r.NetValue?.text(), r.netValue?.text()),
                    taxAmount     : pick(r.TaxAmount?.text(), r.taxAmount?.text()),
                    grossValue    : pick(r.GrossValue?.text(), r.grossValue?.text()),
                    currency      : pick(r.Currency?.text(), r.currency?.text()),
                    validFrom     : pick(r.ValidFrom?.text(), r.validFrom?.text()),
                    validTo       : pick(r.ValidTo?.text(), r.validTo?.text()),
                    itemCount     : pick(r.ItemCount?.text(), String.valueOf(lineItems.size())),
                    pmnttrms      : pick(r.Pmnttrms?.text(), r.pmnttrms?.text(), r.PaymentTerms?.text(), r.paymentTerms?.text()),
                    pmnttrmsText  : pick(r.PmnttrmsText?.text(), r.pmnttrmsText?.text(), r.PaymentTermsText?.text(), r.paymentTermsText?.text()),
                    incoterms1    : pick(r.Incoterms1?.text(), r.incoterms1?.text(), r.Incoterms?.text(), r.incoterms?.text()),
                    incoterms1Text: pick(r.Incoterms1Text?.text(), r.incoterms1Text?.text(), r.IncotermsText?.text(), r.incotermsText?.text()),
                    incoterms2    : pick(r.Incoterms2?.text(), r.incoterms2?.text()),
                    // ========== TRẢ VỀ REQUESTER EMAIL ==========
                    createdBy     : requesterEmail,
                    requesterEmail: requesterEmail,
                    createdAt     : pick(r.CreatedAt?.text(), r.createdAt?.text()),
                    ItItems       : lineItems
                ]

                detailResults << detail

                // FIX: Xóa requestId khỏi items array, đảm bảo quotationNo luôn có
                items << [
                    batchId       : batchId,
                    quotationNo   : displayQuotationNo,
                    salesOrder    : "",
                    deliveryDoc   : "",
                    billingDoc    : "",
                    status        : cbSt,
                    callbackStatus: cbSt,
                    callbackStep  : stepByStatus(st),
                    message       : msg
                ]
            }
        }

        if (!items || items.isEmpty()) {
            def nonSummary = retItems.findAll { !String.valueOf(it.items).equalsIgnoreCase("SUMMARY") }
            items = nonSummary.collect { rr ->
                def qNoRaw = pick(
                    extractCreatedDocFromText(pick(rr.msgDesc, summaryMsg)),
                    rr.items
                )
                def st = normStatus(pick(rr.msgType))
                def cbSt = toCallbackStatus(st)
                def qNo = normalizeQuotationNo(qNoRaw, st)
                
                // FIX: Xóa requestId khỏi fallback items
                [
                    batchId       : batchId,
                    quotationNo   : qNo,
                    salesOrder    : "",
                    deliveryDoc   : "",
                    billingDoc    : "",
                    status        : cbSt,
                    callbackStatus: cbSt,
                    callbackStep  : stepByStatus(st),
                    message       : itemMessage(batchId, qNo, st, pick(rr.msgDesc, summaryMsg))
                ]
            }

            detailResults = items.collect { it ->
                [
                    quotationNo   : pick(it.quotationNo),
                    status        : pick(it.status),
                    callbackStatus: pick(it.callbackStatus),
                    callbackStep  : pick(it.callbackStep),
                    message       : pick(it.message),
                    soldTo        : pick(it.status) == "ERROR" ? "Unknown" : "",
                    soldToName    : pick(it.status) == "ERROR" ? "Unknown" : "",
                    purchNoC      : "",
                    netValue      : "",
                    taxAmount     : "",
                    grossValue    : "",
                    currency      : "",
                    validFrom     : "",
                    validTo       : "",
                    itemCount     : "0",
                    // ========== TRẢ VỀ REQUESTER EMAIL ==========
                    createdBy     : requesterEmail,
                    requesterEmail: requesterEmail,
                    createdAt     : "",
                    ItItems       : []
                ]
            }
        }

        if (!items || items.isEmpty()) {
            throw new Exception("No valid quotation items found in XML")
        }

        int success = items.count { String.valueOf(it.callbackStatus).toUpperCase() == "SALES_APPROVED" }
        int error = items.count { String.valueOf(it.callbackStatus).toUpperCase() == "ERROR" }
        int running = items.count { String.valueOf(it.callbackStatus).toUpperCase() == "RUNNING" }

        String overall = overallStatus(success, error, running)
        String overallStep = (overall == "ERROR")
            ? "Create Quotation Failed"
            : (overall == "RUNNING" ? "Create Quotation In Progress" : "Create Quotation Completed")

        def firstQuotationNo = items ? pick(items[0].quotationNo) : ""
        def rootRequestId = pick(batchId, workflowInstanceId) // RequestId tổng vẫn giữ
        def callbackMessage = (overall == "ERROR")
            ? pick(items ? items[0].message : "", summaryMsg, "${items.size()} document(s) processed")
            : pick(summaryMsg, "${items.size()} document(s) processed")

        def firstWrapper = x.depthFirst().find { lname(it.name()).equalsIgnoreCase("ResponseWrapper") }

        def payloadObject = [
            summary           : retItems,
            resultsCount      : detailResults.size(),
            results           : detailResults,
            flowType          : firstWrapper ? pick(firstWrapper.FlowType?.text()) : "",
            isLastOrder       : firstWrapper ? pick(firstWrapper.IsLastOrder?.text()) : "",
            batchId           : batchId,
            workflowInstanceId: workflowInstanceId,
            fileType          : fileType
        ]

        def callbackPayload = [
            batchId           : batchId,
            requestId         : rootRequestId,
            quotationNo       : firstQuotationNo,
            salesOrder        : "",
            callbackSource    : "SALES_APPROVER",
            callbackStatus    : overall,
            status            : overall,
            callbackStep      : overallStep,
            workflowInstanceId: workflowInstanceId,
            fileType          : fileType,
            uploadType        : fileType,
            // ========== TRẢ VỀ REQUESTER EMAIL ==========
            requesterEmail    : requesterEmail,
            message           : callbackMessage,
            items             : items,
            payload           : JsonOutput.toJson(payloadObject)
        ]

        String capRoute = (overall == "ERROR") ? "FAIL" : "OK"

        message.setProperty("overallStatus", overall)
        message.setProperty("capRoute", capRoute)
        message.setHeader("CamelHttpMethod", "POST")
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        // ========== SET REQUESTER EMAIL VÀO HEADER ==========
        if (requesterEmail) {
            message.setHeader("X-Requester-Email", requesterEmail)
        }
        message.setBody(JsonOutput.toJson(callbackPayload))
        return message
    } catch (Exception ex) {
        def err = pick(ex?.message, "Unknown CPI transformation error")
        def fallbackMsg = "CPI callback transform failed: ${err}"

        def callbackPayload = [
            batchId           : batchId,
            requestId         : pick(batchId, workflowInstanceId, "UNKNOWN"),
            quotationNo       : "UNKNOWN",
            salesOrder        : "",
            callbackSource    : "SALES_APPROVER",
            callbackStatus    : "ERROR",
            status            : "ERROR",
            callbackStep      : "Create Quotation Failed",
            workflowInstanceId: workflowInstanceId,
            fileType          : fileType,
            uploadType        : fileType,
            // ========== TRẢ VỀ REQUESTER EMAIL ==========
            requesterEmail    : requesterEmail,
            message           : fallbackMsg,
            items             : [[
                batchId       : batchId,
                quotationNo   : "UNKNOWN",
                salesOrder    : "",
                deliveryDoc   : "",
                billingDoc    : "",
                status        : "ERROR",
                callbackStatus: "ERROR",
                callbackStep  : "Create Quotation Failed",
                message       : fallbackMsg
            ]],
            payload           : JsonOutput.toJson([
                transformError: true,
                error         : err,
                results       : [[
                    quotationNo: "UNKNOWN",
                    soldTo     : "Unknown",
                    soldToName : "Unknown",
                    status     : "ERROR",
                    callbackStatus: "ERROR",
                    message    : fallbackMsg,
                    ItItems    : []
                ]],
                bodyPreview   : String.valueOf(body ?: "").take(1200),
                batchId       : batchId,
                workflowInstanceId: workflowInstanceId,
                fileType      : fileType,
                requesterEmail: requesterEmail
            ])
        ]

        message.setProperty("overallStatus", "ERROR")
        message.setProperty("capRoute", "FAIL")
        message.setHeader("CamelHttpMethod", "POST")
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        // ========== SET REQUESTER EMAIL VÀO HEADER ==========
        if (requesterEmail) {
            message.setHeader("X-Requester-Email", requesterEmail)
        }
        message.setBody(JsonOutput.toJson(callbackPayload))
        return message
    }
}
