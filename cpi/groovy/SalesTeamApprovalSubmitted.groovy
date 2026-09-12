import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput
import groovy.json.JsonSlurper
import groovy.util.XmlSlurper
import java.io.StringReader

def pick(Object... vals) {
    for (def v : vals) {
        def s = (v == null) ? "" : String.valueOf(v).trim()
        if (s) return s
    }
    return ""
}

def normalizeText(def value) {
    def t = (value == null) ? "" : String.valueOf(value)
    t = t.replace("\u0000", "")
    t = t.replaceFirst("^\\uFEFF", "")
    return t.trim()
}

def localName(def n) {
    def s = String.valueOf(n ?: "")
    return s.contains(":") ? s.substring(s.indexOf(":") + 1) : s
}

def parseJsonFromReader(java.io.Reader reader) {
    if (reader == null) return [:]
    try {
        def obj = new JsonSlurper().parse(reader)
        return (obj instanceof Map) ? obj : [:]
    } catch (Exception ignored) {
        return [:]
    } finally {
        try { reader?.close() } catch (Exception ignored2) {}
    }
}

def parseJsonFromAny(def value) {
    if (value == null) return [:]
    if (value instanceof Map) return value
    if (value instanceof java.io.Reader) return parseJsonFromReader((java.io.Reader) value)

    def text = normalizeText(value)
    if (!text) return [:]
    return parseJsonFromReader(new StringReader(text))
}

def parseXmlSafely(def value) {
    def raw = normalizeText(value)
    if (!raw) return null

    int idx = raw.indexOf("<")
    if (idx < 0) return null
    if (idx > 0) raw = raw.substring(idx).trim()

    if (!raw.startsWith("<")) return null

    try {
        return new XmlSlurper(false, false).parseText(raw)
    } catch (Exception ignored) {
        return null
    }
}

def asList(def v) {
    if (v instanceof List) return v
    if (v instanceof Map) {
        if (v.item instanceof List) return v.item
        if (v.item instanceof Map) return [v.item]
        return [v]
    }
    return []
}

def extractQuotationDocFromMsg(String msg) {
    def m = (msg ?: "") =~ /(?i)Quotation\\s+([0-9A-Za-z]+)/
    return m.find() ? m.group(1) : ""
}

def determineCallback(def wfStatusRaw) {
    def wfStatus = pick(wfStatusRaw).toUpperCase()

    def out = [
        wfStatus      : wfStatus,
        callbackStatus: "ERROR",
        callbackStep  : "Sales Team Approval Failed",
        capMessage    : "Sales Team approval failed",
        isOk          : false
    ]

    if (wfStatus in ["RUNNING", "STARTED", "PENDING"]) {
        out.callbackStatus = "RUNNING"
        out.callbackStep = "Sales Team Approval Submitted"
        out.capMessage = "Quotation has been sent to Sales Department for Approval"
        out.isOk = true
    } else if (wfStatus in ["COMPLETED", "SUCCESS", "APPROVED"]) {
        out.callbackStatus = "APPROVED"
        out.callbackStep = "Sales Team Approval Completed"
        out.capMessage = "Quotation has been approved by Sales Department"
        out.isOk = true
    }

    return out
}

def buildItemMessage(String batchId, String quotationNo, Map callbackInfo, String fallbackMsg) {
    def q = pick(quotationNo, "UNKNOWN")
    def step = pick(callbackInfo.callbackStep)
    def status = pick(callbackInfo.callbackStatus)
    
    // Custom message for Sales Team Approval Submitted
    if (step == "Sales Team Approval Submitted" && status == "RUNNING") {
        return "Quotation ${q} has been sent to Sales Department for Approval"
    }
    
    // Custom message for Sales Team Approval Completed
    if (step == "Sales Team Approval Completed" && status == "APPROVED") {
        return "Quotation ${q} has been approved by Sales Department"
    }
    
    // Error case
    if (status == "ERROR") {
        return pick(
            fallbackMsg,
            (batchId ? "${batchId}: Quotation ${q} failed." : "Quotation ${q} failed.")
        )
    }
    
    // Default success message
    return batchId
        ? "${batchId}: Quotation ${q} created successfully."
        : "Quotation ${q} created successfully."
}

def buildRow(String batchId, String reqId, String docNo, Map callbackInfo, String rawMsg) {
    def qNo = pick(docNo, reqId, "UNKNOWN")
    return [
        batchId     : batchId,
        quotationNo : qNo,
        salesOrder  : "",
        deliveryDoc : "",
        billingDoc  : "",
        status      : callbackInfo.callbackStatus,
        message     : buildItemMessage(batchId, qNo, callbackInfo, rawMsg),
        callbackStep: callbackInfo.callbackStep,
        requestId   : pick(reqId)
    ]
}

def buildRowsFromXml(def xmlRoot, String batchId, Map callbackInfo) {
    def rows = []
    def summaryMsg = ""

    def etResultsNode = xmlRoot.depthFirst().find { localName(it.name()).equalsIgnoreCase("EtResults") }
    def etReturnNode  = xmlRoot.depthFirst().find { localName(it.name()).equalsIgnoreCase("EtReturn") }

    def retItems = []
    if (etReturnNode) {
        retItems = etReturnNode.children()
            .findAll { localName(it.name()).equalsIgnoreCase("item") }
            .collect { r ->
                [
                    items  : pick(r.Items?.text(), r.items?.text()),
                    msgDesc: pick(r.MsgDesc?.text(), r.msgDesc?.text(), r.Message?.text(), r.message?.text())
                ]
            }
    }

    def retMap = [:]
    retItems.each { rr ->
        def k = pick(rr.items)
        if (k) retMap[k] = rr
    }

    def summary = retItems.find { String.valueOf(it.items).equalsIgnoreCase("SUMMARY") }
    summaryMsg = pick(summary?.msgDesc)

    if (etResultsNode) {
        rows = etResultsNode.children()
            .findAll { localName(it.name()).equalsIgnoreCase("item") }
            .collect { r ->
                def reqId = pick(r.QtReqId?.text(), r."QT_REQ_ID"?.text(), r.PurchNoC?.text(), r.QuotationNo?.text())
                def rawMsg = pick(r.Message?.text(), retMap[reqId]?.msgDesc, callbackInfo.capMessage)
                def docNo = pick(r.Quotation?.text())
                if (!docNo) docNo = extractQuotationDocFromMsg(rawMsg)
                return buildRow(batchId, reqId, docNo, callbackInfo, rawMsg)
            }
            .findAll { pick(it.quotationNo, it.requestId) }
    }

    if (!rows || rows.isEmpty()) {
        def nonSummary = retItems.findAll { !String.valueOf(it.items).equalsIgnoreCase("SUMMARY") }
        rows = nonSummary.collect { rr ->
            def reqId = pick(rr.items)
            def rawMsg = pick(rr.msgDesc, callbackInfo.capMessage)
            def docNo = extractQuotationDocFromMsg(rawMsg)
            return buildRow(batchId, reqId, docNo, callbackInfo, rawMsg)
        }.findAll { pick(it.quotationNo, it.requestId) }
    }

    return [rows: rows, summaryMsg: summaryMsg]
}

def buildRowsFromJson(Map qObj, String batchId, Map callbackInfo) {
    def rows = []
    def summaryMsg = ""

    if (!(qObj instanceof Map) || qObj.isEmpty()) {
        return [rows: rows, summaryMsg: summaryMsg]
    }

    def src = []
    if (qObj.items instanceof List) {
        src = qObj.items
    } else if (qObj.responses instanceof Map) {
        src = asList(qObj.responses.item)
    } else if (qObj.EtResults instanceof Map) {
        src = asList(qObj.EtResults.item)
    } else if (qObj.etResults instanceof Map) {
        src = asList(qObj.etResults.item)
    }

    rows = src.collect { r ->
        def reqId = pick(r.qtReqId, r.QtReqId, r.QT_REQ_ID, r.Items, r.items, r.quotationNo, r.QuotationNo)
        def rawMsg = pick(r.message, r.Message, r.msgDesc, r.MsgDesc, callbackInfo.capMessage)
        def docNo = pick(r.quotation, r.Quotation)
        if (!docNo) docNo = extractQuotationDocFromMsg(rawMsg)
        def rowBatchId = pick(r.batchId, r.batchID, r.BatchId, r.Batch_ID, batchId)
        return buildRow(rowBatchId, reqId, docNo, callbackInfo, rawMsg)
    }.findAll { pick(it.quotationNo, it.requestId) }

    if ((!rows || rows.isEmpty()) && qObj.payload) {
        def payloadObj = parseJsonFromAny(qObj.payload)
        def summary = (payloadObj.summary instanceof List) ? payloadObj.summary : []

        rows = summary
            .findAll { !String.valueOf(pick(it.items, it.Items)).equalsIgnoreCase("SUMMARY") }
            .collect { s ->
                def reqId = pick(s.items, s.Items)
                def rawMsg = pick(s.msgDesc, s.MsgDesc, s.message, s.Message, callbackInfo.capMessage)
                def docNo = extractQuotationDocFromMsg(rawMsg)
                return buildRow(batchId, reqId, docNo, callbackInfo, rawMsg)
            }
            .findAll { pick(it.quotationNo, it.requestId) }

        def sm = summary.find { String.valueOf(pick(it.items, it.Items)).equalsIgnoreCase("SUMMARY") }
        summaryMsg = pick(sm?.msgDesc, sm?.MsgDesc)
    }

    return [rows: rows, summaryMsg: summaryMsg]
}

Message processData(Message message) {
    def headers = message.getHeaders()
    def props = message.getProperties()
    
    // Get fileType from header (passed from original upload)
    def fileType = pick(
        headers.get("fileType"),
        headers.get("x-file-type"),
        headers.get("uploadType"),
        props.get("fileType")
    )

    def batchId = pick(
        props.get("batchId"),
        headers.get("SAP_MessageProcessingLogID"),
        headers.get("sap_messageprocessinglogid")
    )

    def quotationRaw = props.get("quotationListResult")

    def approvalObj = parseJsonFromAny(props.get("salesApproverResult"))
    if (!(approvalObj instanceof Map) || approvalObj.isEmpty()) {
        approvalObj = parseJsonFromReader(message.getBody(java.io.Reader))
    }

    def callbackInfo = determineCallback(approvalObj.status)

    def rows = []
    def summaryMsg = ""

    def xmlRoot = parseXmlSafely(quotationRaw)
    if (xmlRoot != null) {
        def parsed = buildRowsFromXml(xmlRoot, batchId, callbackInfo)
        rows = parsed.rows
        summaryMsg = pick(parsed.summaryMsg)
    }

    if (!rows || rows.isEmpty()) {
        def qObj = parseJsonFromAny(quotationRaw)
        def parsed = buildRowsFromJson(qObj, batchId, callbackInfo)
        rows = parsed.rows
        summaryMsg = pick(summaryMsg, parsed.summaryMsg)
    }

    if (!rows || rows.isEmpty()) {
        def fallbackReq = pick(
            props.get("quotationNo"),
            props.get("requestId"),
            props.get("qtReqId"),
            props.get("QtReqId")
        )
        def fallbackDoc = pick(
            props.get("quotationDocNo"),
            props.get("createdQuotationNo")
        )
        rows = [buildRow(batchId, fallbackReq, fallbackDoc, callbackInfo, callbackInfo.capMessage)]
    }

    def overallMsg = pick(
        summaryMsg,
        (rows && rows.size() > 0 && callbackInfo.callbackStatus != "ERROR") ? "${rows.size()} document(s) created successfully" : "",
        callbackInfo.capMessage
    )

    def payload = [
        batchId           : batchId,
        quotationNo       : pick(rows[0]?.quotationNo),
        salesOrder        : "",
        callbackSource    : "SALES_APPROVER",
        callbackStatus    : callbackInfo.callbackStatus,
        callbackStep      : callbackInfo.callbackStep,
        workflowInstanceId: pick(
            approvalObj.id,
            approvalObj.rootInstanceId,
            approvalObj.parentInstanceId,
            props.get("workflowInstanceId"),
            headers.get("SAP_WorkflowInstanceId")
        ),
        fileType          : fileType,
        uploadType        : fileType,
        message           : overallMsg,
        items             : rows,
        payload           : JsonOutput.toJson(approvalObj)
    ]

    message.setProperty("capRoute", callbackInfo.isOk ? "OK" : "FAIL")
    message.setProperty("sbpaStatus", callbackInfo.wfStatus)
    message.setProperty("overallStatus", callbackInfo.callbackStatus)

    message.setHeader("CamelHttpMethod", "POST")
    message.setHeader("Content-Type", "application/json")
    message.setHeader("Accept", "application/json")
    message.setBody(JsonOutput.toJson(payload))
    return message
}
