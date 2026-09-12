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
    if (st == "SUCCESS") return "IF_DCAP_O2C_ProcessSalesOrder: Completed"
    if (st == "ERROR") return "IF_DCAP_O2C_ProcessSalesOrder: Failed"
    return "IF_DCAP_O2C_ProcessSalesOrder: In Progress"
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

def resolveQuotationNo(String rawQuotationNo, String status, String reqKey) {
    def q = pick(rawQuotationNo)
    if (q) return q
    // Do not leak request IDs as quotationNo on failed/running callbacks.
    return status == "SUCCESS" ? pick(reqKey) : "UNKNOWN"
}

def itemMessage(String batchId, String salesOrderNo, String quotationNo, String status, String fallbackMsg) {
    def b = pick(batchId)
    def q = pick(quotationNo, "UNKNOWN")
    def so = pick(salesOrderNo)
    if (status == "SUCCESS") {
        if (so) {
            return b ? "${b}: Sales Order ${so} created from Quotation ${q}." : "Sales Order ${so} created from Quotation ${q}."
        }
        return b ? "${b}: Sales Order created for Quotation ${q}." : "Sales Order created for Quotation ${q}."
    }
    if (status == "RUNNING") {
        return b ? "${b}: Sales Order for Quotation ${q} is processing." : "Sales Order for Quotation ${q} is processing."
    }
    if (so) {
        return pick(fallbackMsg, (b ? "${b}: Sales Order ${so} failed for Quotation ${q}." : "Sales Order ${so} failed for Quotation ${q}."))
    }
    return pick(fallbackMsg, (b ? "${b}: Sales Order creation failed for Quotation ${q}." : "Sales Order creation failed for Quotation ${q}."))
}

def normalizeLineItem(def raw) {
    def it = raw ?: [:]
    return [
        ItemNo    : pick(it.ItemNo?.text(), it.itemNo?.text(), it.ItemNo, it.itemNo),
        ItemCateg : pick(it.ItemCateg?.text(), it.itemCateg?.text(), it.ItemCategory?.text(), it.ItemCateg, it.itemCateg, it.itemCategory),
        Material  : pick(it.Material?.text(), it.material?.text(), it.Material, it.material),
        MatDesc   : pick(it.MatDesc?.text(), it.matDesc?.text(), it.Description?.text(), it.MatDesc, it.matDesc, it.description),
        Quantity  : pick(it.Quantity?.text(), it.quantity?.text(), it.Quantity, it.quantity),
        SalesUnit : pick(it.SalesUnit?.text(), it.salesUnit?.text(), it.Unit?.text(), it.SalesUnit, it.salesUnit, it.unit),
        NetPrice  : pick(it.NetPrice?.text(), it.netPrice?.text(), it.NetPrice, it.netPrice),
        ItemValue : pick(it.ItemValue?.text(), it.itemValue?.text(), it.ItemValue, it.itemValue),
        Plant     : pick(it.Plant?.text(), it.plant?.text(), it.Plant, it.plant),
        StorLoc   : pick(it.StorLoc?.text(), it.storLoc?.text(), it.StorageLoc?.text(), it.StorLoc, it.storLoc, it.storageLoc),
        ShipPoint : pick(it.ShipPoint?.text(), it.shipPoint?.text(), it.ShippingPoint?.text(), it.ShipPoint, it.shipPoint, it.shippingPoint),
        ReqDate   : pick(it.ReqDate?.text(), it.reqDate?.text(), it.ReqDateH?.text(), it.ReqDate, it.reqDate, it.reqDateH),
        RefDoc    : pick(it.RefDoc?.text(), it.refDoc?.text(), it.ReferenceDoc?.text(), it.RefDoc, it.refDoc, it.referenceDoc),
        RefItem   : pick(it.RefItem?.text(), it.refItem?.text(), it.ReferenceItem?.text(), it.RefItem, it.refItem, it.referenceItem),
        Currency  : pick(it.Currency?.text(), it.currency?.text(), it.Currency, it.currency)
    ]
}

Message processData(Message message) {
    // Keep FAIL as default to avoid wrong route when unexpected error happens.
    message.setProperty("capRoute", "FAIL")

    def body = message.getBody(String) ?: ""
    def props = message.getProperties()
    def headers = message.getHeaders()

    def batchId = pick(
        props.get("batchId"),
        headers.get("SAP_MessageProcessingLogID"),
        headers.get("sap_messageprocessinglogid")
    )
    def workflowInstanceId = pick(props.get("workflowInstanceId"), headers.get("SAP_WorkflowInstanceId"))

    try {
        def x = new XmlSlurper(false, false).parseText(body)

        def etResultsNode = x.depthFirst().find { lname(it.name()).equalsIgnoreCase("EtResults") }
        def etReturnNode = x.depthFirst().find { lname(it.name()).equalsIgnoreCase("EtReturn") }

        def retItems = []
        if (etReturnNode) {
            retItems = etReturnNode.children().findAll { lname(it.name()).equalsIgnoreCase("item") }.collect { r ->
                [
                    items  : pick(r.Items?.text(), r.items?.text()),
                    msgType: normStatus(pick(r.MsgType?.text(), r.msgType?.text())),
                    msgDesc: pick(r.MsgDesc?.text(), r.msgDesc?.text(), r.Message?.text(), r.message?.text())
                ]
            }
        }

        def retByKey = [:]
        retItems.each { rr ->
            def k = pick(rr.items).toUpperCase()
            if (k) retByKey[k] = rr
        }

        def summary = retItems.find { String.valueOf(it.items).equalsIgnoreCase("SUMMARY") }
        def summaryMsg = summary?.msgDesc ?: ""

        def items = []
        def detailResults = []

        if (etResultsNode) {
            etResultsNode.children().findAll { lname(it.name()).equalsIgnoreCase("item") }.each { r ->
                def reqKey = pick(
                    r.SoReqId?.text(),
                    r.soReqId?.text(),
                    r.QtReqId?.text(),
                    r."QT_REQ_ID"?.text(),
                    r.PurchNoC?.text(),
                    r.purchNoC?.text()
                )

                def rawMsg = pick(r.Message?.text(), r.message?.text())
                def rawQuotationNo = pick(
                    r.Quotation?.text(),
                    r.QuotationNo?.text(),
                    r.quotationNo?.text(),
                    r.Quotation?.text(),
                    extractCreatedDocFromText(rawMsg)
                )
                def salesOrderNo = pick(r.SalesOrder?.text(), r.salesOrder?.text())

                def ret = retByKey[pick(reqKey, salesOrderNo, rawQuotationNo).toUpperCase()]
                if (!ret) ret = retByKey[pick(salesOrderNo).toUpperCase()]
                if (!ret) ret = retByKey[pick(rawQuotationNo).toUpperCase()]

                def st = normStatus(pick(r.Status?.text(), r.status?.text(), ret?.msgType))
                def quotationNo = resolveQuotationNo(rawQuotationNo, st, reqKey)
                def cbSt = toCallbackStatus(st)
                def msg = itemMessage(batchId, salesOrderNo, quotationNo, st, pick(rawMsg, ret?.msgDesc, summaryMsg))

                def itItemsNode = r.ItItems ?: r.itItems
                def lineItems = []
                if (itItemsNode) {
                    lineItems = itItemsNode.children()
                        .findAll { lname(it.name()).equalsIgnoreCase("item") }
                        .collect { normalizeLineItem(it) }
                        .findAll { li -> pick(li.ItemNo, li.Material, li.MatDesc, li.Quantity, li.ItemValue) }
                }

                def detail = [
                    requestId     : pick(reqKey, batchId),
                    quotationNo   : quotationNo,
                    salesOrder    : salesOrderNo,
                    status        : cbSt,
                    callbackStatus: cbSt,
                    callbackStep  : stepByStatus(st),
                    message       : msg,
                    docType       : pick(r.DocType?.text(), r.docType?.text()),
                    salesOrg      : pick(r.SalesOrg?.text(), r.salesOrg?.text()),
                    distrChan     : pick(r.DistrChan?.text(), r.distrChan?.text()),
                    division      : pick(r.Division?.text(), r.division?.text()),
                    soldTo        : pick(r.SoldTo?.text(), r.soldTo?.text()),
                    soldToName    : pick(r.SoldToName?.text(), r.soldToName?.text()),
                    shipTo        : pick(r.ShipTo?.text(), r.shipTo?.text()),
                    poNumber      : pick(r.PoNumber?.text(), r.poNumber?.text(), r.PONumber?.text()),
                    purchNoC      : pick(r.PurchNoC?.text(), r.purchNoC?.text()),
                    netValue      : pick(r.NetValue?.text(), r.netValue?.text()),
                    taxAmount     : pick(r.TaxAmount?.text(), r.taxAmount?.text()),
                    grossValue    : pick(r.GrossValue?.text(), r.grossValue?.text()),
                    currency      : pick(r.Currency?.text(), r.currency?.text()),
                    reqDateH      : pick(r.ReqDateH?.text(), r.reqDateH?.text(), r.ReqDate?.text(), r.reqDate?.text()),
                    validFrom     : pick(r.ValidFrom?.text(), r.validFrom?.text()),
                    validTo       : pick(r.ValidTo?.text(), r.validTo?.text()),
                    itemCount     : pick(r.ItemCount?.text(), String.valueOf(lineItems.size())),
                    createdBy     : pick(r.CreatedBy?.text(), r.createdBy?.text()),
                    createdAt     : pick(r.CreatedAt?.text(), r.createdAt?.text()),
                    ItItems       : lineItems
                ]

                detailResults << detail

                // Keep items strictly CAP action schema-compatible.
                items << [
                    batchId       : batchId,
                    requestId     : pick(reqKey, batchId),
                    quotationNo   : quotationNo,
                    salesOrder    : salesOrderNo,
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
                def st = normStatus(pick(rr.msgType))
                def qNo = resolveQuotationNo(
                    extractCreatedDocFromText(pick(rr.msgDesc, summaryMsg)),
                    st,
                    rr.items
                )
                def cbSt = toCallbackStatus(st)
                [
                    batchId       : batchId,
                    requestId     : pick(rr.items, batchId),
                    quotationNo   : qNo,
                    salesOrder    : "",
                    deliveryDoc   : "",
                    billingDoc    : "",
                    status        : cbSt,
                    callbackStatus: cbSt,
                    callbackStep  : stepByStatus(st),
                    message       : itemMessage(batchId, "", qNo, st, pick(rr.msgDesc, summaryMsg))
                ]
            }

            detailResults = items.collect { it ->
                [
                    requestId     : pick(it.requestId),
                    quotationNo   : pick(it.quotationNo),
                    salesOrder    : pick(it.salesOrder),
                    status        : pick(it.status),
                    callbackStatus: pick(it.callbackStatus),
                    callbackStep  : pick(it.callbackStep),
                    message       : pick(it.message),
                    docType       : "",
                    salesOrg      : "",
                    distrChan     : "",
                    division      : "",
                    soldTo        : "",
                    soldToName    : "",
                    shipTo        : "",
                    poNumber      : "",
                    purchNoC      : "",
                    netValue      : "",
                    taxAmount     : "",
                    grossValue    : "",
                    currency      : "",
                    reqDateH      : "",
                    validFrom     : "",
                    validTo       : "",
                    itemCount     : "0",
                    createdBy     : "",
                    createdAt     : "",
                    ItItems       : []
                ]
            }
        }

        // Hard fallback: if both EtResults and EtReturn don't contain useful rows.
        if (!items || items.isEmpty()) {
            items = [[
                batchId       : batchId,
                requestId     : pick(batchId, workflowInstanceId, "UNKNOWN"),
                quotationNo   : "UNKNOWN",
                salesOrder    : "",
                deliveryDoc   : "",
                billingDoc    : "",
                status        : "ERROR",
                callbackStatus: "ERROR",
                callbackStep  : "IF_DCAP_O2C_ProcessSalesOrder: Failed",
                message       : pick(summaryMsg, "No valid result rows found in CPI callback payload")
            ]]
            detailResults = [[
                requestId     : pick(batchId, workflowInstanceId, "UNKNOWN"),
                quotationNo   : "UNKNOWN",
                salesOrder    : "",
                status        : "ERROR",
                callbackStatus: "ERROR",
                callbackStep  : "IF_DCAP_O2C_ProcessSalesOrder: Failed",
                message       : pick(summaryMsg, "No valid result rows found in CPI callback payload"),
                docType       : "",
                salesOrg      : "",
                distrChan     : "",
                division      : "",
                soldTo        : "",
                soldToName    : "",
                shipTo        : "",
                poNumber      : "",
                purchNoC      : "",
                netValue      : "",
                taxAmount     : "",
                grossValue    : "",
                currency      : "",
                reqDateH      : "",
                validFrom     : "",
                validTo       : "",
                itemCount     : "0",
                createdBy     : "",
                createdAt     : "",
                ItItems       : []
            ]]
        }

        int success = items.count { String.valueOf(it.callbackStatus).toUpperCase() == "SALES_APPROVED" }
        int error = items.count { String.valueOf(it.callbackStatus).toUpperCase() == "ERROR" }
        int running = items.count { String.valueOf(it.callbackStatus).toUpperCase() == "RUNNING" }

        String overall = overallStatus(success, error, running)
        String overallStep = (overall == "ERROR")
            ? "IF_DCAP_O2C_ProcessSalesOrder: Failed"
            : (overall == "RUNNING" ? "IF_DCAP_O2C_ProcessSalesOrder: In Progress" : "IF_DCAP_O2C_ProcessSalesOrder: Completed")

        def firstQuotationNo = items ? pick(items[0].quotationNo, "UNKNOWN") : "UNKNOWN"
        def firstSalesOrder = items ? pick(items[0].salesOrder) : ""
        def rootRequestId = pick(items[0]?.requestId, batchId, workflowInstanceId)

        def payloadObject = [
            summary           : retItems,
            resultsCount      : detailResults.size(),
            results           : detailResults,
            flowType          : pick(x.FlowType?.text()),
            isLastOrder       : pick(x.IsLastOrder?.text()),
            batchId           : batchId,
            workflowInstanceId: workflowInstanceId
        ]

        def callbackPayload = [
            batchId           : batchId,
            requestId         : rootRequestId,
            quotationNo       : firstQuotationNo,
            salesOrder        : firstSalesOrder,
            callbackSource    : "SALES_APPROVER",
            callbackStatus    : overall,
            status            : overall,
            callbackStep      : overallStep,
            workflowInstanceId: workflowInstanceId,
            message           : pick(summaryMsg, "${items.size()} document(s) processed"),
            items             : items,
            payload           : JsonOutput.toJson(payloadObject)
        ]

        String capRoute = (overall == "ERROR") ? "FAIL" : "OK"

        message.setProperty("overallStatus", overall)
        message.setProperty("capRoute", capRoute)
        message.setHeader("CamelHttpMethod", "POST")
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        message.setBody(JsonOutput.toJson(callbackPayload))
        return message
    } catch (Exception ex) {
        def err = pick(ex?.message, "Unknown CPI transformation error")
        def fallbackMsg = "CPI callback transform failed: ${err}"

        def callbackPayload = [
            batchId           : batchId,
            requestId         : pick(batchId, workflowInstanceId, "UNKNOWN"),
            quotationNo       : "",
            salesOrder        : "",
            callbackSource    : "SALES_APPROVER",
            callbackStatus    : "ERROR",
            status            : "ERROR",
            callbackStep      : "IF_DCAP_O2C_ProcessSalesOrder: Failed",
            workflowInstanceId: workflowInstanceId,
            message           : fallbackMsg,
            items             : [[
                batchId       : batchId,
                requestId     : pick(batchId, workflowInstanceId, "UNKNOWN"),
                quotationNo   : "",
                salesOrder    : "",
                deliveryDoc   : "",
                billingDoc    : "",
                status        : "ERROR",
                callbackStatus: "ERROR",
                callbackStep  : "IF_DCAP_O2C_ProcessSalesOrder: Failed",
                message       : fallbackMsg
            ]],
            payload           : JsonOutput.toJson([
                transformError: true,
                error         : err,
                bodyPreview   : String.valueOf(body ?: "").take(1200),
                batchId       : batchId,
                workflowInstanceId: workflowInstanceId
            ])
        ]

        message.setProperty("overallStatus", "ERROR")
        message.setProperty("capRoute", "FAIL")
        message.setHeader("CamelHttpMethod", "POST")
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        message.setBody(JsonOutput.toJson(callbackPayload))
        return message
    }
}
