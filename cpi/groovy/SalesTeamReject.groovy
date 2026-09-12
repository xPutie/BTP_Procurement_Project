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
        
        def orderList = json.orders ?: []
        if (orderList.isEmpty()) {
            throw new Exception("No orders found in payload")
        }
        
        // Nhóm orders theo batchId+quotationNo để tránh duplicate
        def batchGroups = [:]
        orderList.each { order ->
            def bId = pick(order.batch, order.batchId, order.BatchId)
            def qNo = pick(order.quotation_no, order.quotationNo, order.QuotationNo)
            def key = "${bId}#${qNo}"
            if (!batchGroups.containsKey(key)) {
                batchGroups[key] = [
                    batchId      : bId,
                    quotationNo  : qNo,
                    flowType     : pick(order.flow_type, order.flowType, order.FlowType, "Sales"),
                    rejectedBy   : pick(order.rejected_by, order.rejectedBy, order.RejectedBy, ""),
                    rejectReason : pick(order.reject_reason, order.rejectReason, order.message, order.Message, "Quotation rejected by Sales Team")
                ]
            }
        }
        
        // Map status REJECTED -> ERROR để CAP hiểu
        def capStatus = "ERROR"
        def callbackStep = "Sales Team Rejected"
        def callbackSource = "SALES_REJECT"
        
        // Build items array từ unique entries
        def itemsArray = []
        def headerBatchId = ""
        def headerRejectedBy = ""
        def headerRejectReason = ""
        def headerFlowType = ""
        
        batchGroups.each { key, order ->
            if (!headerBatchId) {
                headerBatchId = order.batchId
                headerRejectedBy = order.rejectedBy
                headerRejectReason = order.rejectReason
                headerFlowType = order.flowType
            }
            
            itemsArray << [
                batchId       : order.batchId,
                quotationNo   : order.quotationNo,
                salesOrder    : "",
                deliveryDoc   : "",
                billingDoc    : "",
                status        : capStatus,
                callbackStatus: capStatus,
                callbackStep  : callbackStep,
                message       : order.rejectReason ?: "Quotation rejected by Sales Team"
            ]
        }
        
        // Build payload tổng cho CAP - 1 batchId = 1 call
        def capPayload = [
            batchId           : headerBatchId,
            requestId         : headerBatchId,
            quotationNo       : itemsArray.size() > 1 ? "" : pick(itemsArray[0]?.quotationNo),
            salesOrder        : "",
            deliveryDoc       : "",
            billingDoc        : "",
            callbackSource    : callbackSource,
            callbackStatus    : capStatus,
            status            : capStatus,
            callbackStep      : callbackStep,
            workflowInstanceId: "",
            fileType          : "",
            uploadType        : "",
            requesterEmail    : headerRejectedBy,
            message           : itemsArray.size() > 1 ? "${itemsArray.size()} Quotations rejected by Sales Team" : headerRejectReason,
            items             : itemsArray,
            payload           : JsonOutput.toJson([
                rejectReason  : headerRejectReason,
                rejectedBy    : headerRejectedBy,
                originalStatus: "REJECTED",
                flowType      : headerFlowType,
                totalRejected : itemsArray.size(),
                uniqueBatches : batchGroups.keySet().size()
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
