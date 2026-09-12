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
    
    try {
        def slurper = new JsonSlurper()
        def json = slurper.parseText(body)
        
        if (!json.requests || json.requests.isEmpty()) {
            throw new Exception("No delivery requests found to reject")
        }
        
        // Nhóm requests theo batchId để tránh duplicate calls
        def batchGroups = [:]
        json.requests.each { req ->
            def bId = pick(req.batch_id, req.batchId, req.batch)
            def dNo = pick(req.delivery_no, req.deliveryNo, req.delivery)
            def key = "${bId}#${dNo}"
            
            if (!batchGroups.containsKey(key)) {
                batchGroups[key] = [
                    batchId     : bId,
                    deliveryNo  : dNo,
                    rejectReason: pick(req.reject_reason, req.rejectReason, "Rejected by Warehouse without comment"),
                    rejectedBy  : pick(req.rejected_by, req.rejectedBy, "warehouse_admin@nexdrive.vn")
                ]
            }
        }
        
        // Lấy thông tin từ phần tử đầu tiên làm header
        def firstEntry = batchGroups.values()[0]
        def headerBatchId = firstEntry.batchId
        def headerRejectedBy = firstEntry.rejectedBy
        
        // Build items array từ unique entries
        def itemsArray = []
        def allDeliveryNos = []
        
        batchGroups.each { key, req ->
            allDeliveryNos << req.deliveryNo
            itemsArray << [
                batchId       : req.batchId,
                quotationNo   : "",
                salesOrder    : "",
                deliveryDoc   : req.deliveryNo,
                billingDoc    : "",
                status        : "ERROR",
                callbackStatus: "ERROR",
                callbackStep  : "Warehouse Team Rejected",
                message       : req.rejectReason
            ]
        }
        
        // Build message tổng quan
        def summaryMsg = allDeliveryNos.size() > 1 
            ? "[Warehouse Reject] ${allDeliveryNos.size()} Deliveries rejected | By: ${headerRejectedBy}"
            : "[Warehouse Reject] Delivery: ${allDeliveryNos[0]} | By: ${headerRejectedBy} | ${firstEntry.rejectReason}"
        
        // CAP payload cho upsertQuotationProgress
        def capPayload = [
            batchId           : headerBatchId,
            requestId         : headerBatchId,
            quotationNo       : "",
            salesOrder        : "",
            deliveryDoc       : allDeliveryNos.join(", "),
            billingDoc        : "",
            callbackSource    : "WAREHOUSE_REJECT",
            callbackStatus    : "ERROR",
            status            : "ERROR",
            callbackStep      : "Warehouse Team Rejected",
            workflowInstanceId: "",
            fileType          : "",
            uploadType        : "",
            requesterEmail    : "",
            message           : summaryMsg,
            items             : itemsArray,
            payload           : JsonOutput.toJson([
                deliveryNos  : allDeliveryNos,
                rejectReason : firstEntry.rejectReason,
                rejectedBy   : headerRejectedBy,
                source       : "WAREHOUSE",
                totalRejected: itemsArray.size()
            ])
        ]
        
        // Set output headers cho CAP
        message.setBody(JsonOutput.toJson(capPayload))
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        message.setHeader("CamelHttpMethod", "POST")
        
        return message
        
    } catch (Exception ex) {
        // Error fallback
        def errMsg = ex?.message ?: "Unknown error"
        def fallbackPayload = [
            batchId           : "",
            requestId         : "",
            quotationNo       : "",
            salesOrder        : "",
            deliveryDoc       : "",
            billingDoc        : "",
            callbackSource    : "WAREHOUSE_REJECT",
            callbackStatus    : "ERROR",
            status            : "ERROR",
            callbackStep      : "Transform Failed",
            workflowInstanceId: "",
            fileType          : "REJECT",
            uploadType        : "WAREHOUSE_REJECT",
            requesterEmail    : "",
            message           : "Failed to process warehouse reject: ${errMsg}",
            items             : [],
            payload           : JsonOutput.toJson([error: errMsg])
        ]
        
        message.setBody(JsonOutput.toJson(fallbackPayload))
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        message.setHeader("CamelHttpMethod", "POST")
        
        return message
    }
}
