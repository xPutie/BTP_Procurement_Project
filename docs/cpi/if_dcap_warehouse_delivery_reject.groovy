import com.sap.gateway.ip.core.customdev.util.Message
import groovy.json.JsonOutput
import groovy.json.JsonSlurper

Message processData(Message message) {
    def body = message.getBody(String) ?: ""
    
    try {
        def slurper = new JsonSlurper()
        def json = slurper.parseText(body)
        
        if (!json.requests || json.requests.isEmpty()) {
            throw new Exception("No delivery requests found to reject")
        }
        
        def firstReq = json.requests[0]
        
        // Lấy thông tin
        def batchId = firstReq.batch_id ?: ""
        def deliveryNo = firstReq.delivery_no ?: ""
        def rejectReason = firstReq.reject_reason ?: "Rejected by Warehouse without comment"
        def rejectedBy = firstReq.rejected_by ?: "warehouse_admin@nexdrive.vn"
        
        // CAP payload cho upsertQuotationProgress
        def capPayload = [
            batchId           : batchId,
            requestId         : batchId,
            quotationNo       : "", // Không có quotationNo khi reject delivery
            salesOrder        : "",
            deliveryDoc       : deliveryNo,
            billingDoc        : "",
            callbackSource    : "WAREHOUSE_REJECT",
            callbackStatus    : "ERROR", // Để CAP hiểu là lỗi/thất bại
            status            : "ERROR",
            callbackStep      : "Warehouse Team Rejected",
            workflowInstanceId: "",
            fileType          : "REJECT",
            uploadType        : "WAREHOUSE_REJECT",
            requesterEmail    : rejectedBy, // Để CAP hiển thị "Upload By"
            message           : "[Warehouse Reject] Delivery: ${deliveryNo} | By: ${rejectedBy} | ${rejectReason}",
            items             : [
                [
                    batchId       : batchId,
                    quotationNo   : "",
                    salesOrder    : "",
                    deliveryDoc   : deliveryNo,
                    billingDoc    : "",
                    status        : "ERROR",
                    callbackStatus: "ERROR",
                    callbackStep  : "Warehouse Team Rejected",
                    message       : "[Warehouse Reject] Delivery: ${deliveryNo} | By: ${rejectedBy} | ${rejectReason}"
                ]
            ],
            payload           : JsonOutput.toJson([
                deliveryNo   : deliveryNo,
                rejectReason : rejectReason,
                rejectedBy   : rejectedBy,
                source       : "WAREHOUSE"
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
            message           : "[Warehouse Reject] Transform Error: ${errMsg}",
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
