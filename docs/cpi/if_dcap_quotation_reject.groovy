import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

def pick(Object... vals) {
    for (def v : vals) {
        def s = v == null ? "" : String.valueOf(v).trim()
        if (s) return s
    }
    return ""
}

Message processData(Message message) {
    def body = message.getBody(String) ?: ""
    def props = message.getProperties()
    def headers = message.getHeaders()
    
    try {
        def slurper = new JsonSlurper()
        def json = slurper.parseText(body)
        
        // Lấy thông tin từ JSON đầu vào
        def order = json.orders ? json.orders[0] : [:]
        
        def batchId = pick(order.batch, order.batchId, order.BatchId)
        def quotationNo = pick(order.quotation_no, order.quotationNo, order.QuotationNo)
        def flowType = pick(order.flow_type, order.flowType, order.FlowType, "Sales")
        def status = pick(order.status, order.Status, "REJECTED")
        def rejectReason = pick(order.reject_reason, order.rejectReason, order.message, order.Message, "")
        def rejectedBy = pick(order.rejected_by, order.rejectedBy, order.RejectedBy, "")
        
        // Map status REJECTED -> ERROR để CAP hiểu
        def capStatus = "ERROR"
        def callbackStep = "Sales Team Rejected"
        def callbackSource = "SALES_REJECT"
        
        // Build payload cho CAP
        def capPayload = [
            batchId           : batchId,
            requestId         : batchId,
            quotationNo       : quotationNo,
            salesOrder        : "",
            deliveryDoc       : "",
            billingDoc        : "",
            callbackSource    : callbackSource,
            callbackStatus    : capStatus,
            status            : capStatus,
            callbackStep      : callbackStep,
            workflowInstanceId: "",
            fileType          : "REJECT",
            uploadType        : "REJECT",
            requesterEmail    : rejectedBy,
            message           : rejectReason ?: "Quotation rejected by Sales Team",
            items             : [[
                batchId       : batchId,
                quotationNo   : quotationNo,
                salesOrder    : "",
                deliveryDoc   : "",
                billingDoc    : "",
                status        : capStatus,
                callbackStatus: capStatus,
                callbackStep  : callbackStep,
                message       : rejectReason ?: "Quotation rejected by Sales Team"
            ]],
            payload           : JsonOutput.toJson([
                rejectReason : rejectReason,
                rejectedBy   : rejectedBy,
                originalStatus: status,
                flowType     : flowType
            ])
        ]
        
        // Set output
        message.setProperty("capRoute", "OK")
        message.setHeader("CamelHttpMethod", "POST")
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        message.setBody(JsonOutput.toJson(capPayload))
        
        return message
        
    } catch (Exception ex) {
        def err = pick(ex?.message, "Reject transform error")
        
        def fallbackPayload = [
            batchId           : "",
            requestId         : "",
            quotationNo       : "",
            salesOrder        : "",
            callbackSource    : "SALES_REJECT",
            callbackStatus    : "ERROR",
            status            : "ERROR",
            callbackStep      : "Reject Transform Failed",
            message           : "Failed to process reject notification: ${err}",
            items             : [],
            payload           : JsonOutput.toJson([
                transformError: true,
                error         : err,
                bodyPreview   : String.valueOf(body ?: "").take(500)
            ])
        ]
        
        message.setProperty("capRoute", "FAIL")
        message.setHeader("CamelHttpMethod", "POST")
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        message.setBody(JsonOutput.toJson(fallbackPayload))
        return message
    }
}
