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
    def batchId = "" 
    
    try {
        java.io.Reader reader = message.getBody(java.io.Reader)
        def json = new JsonSlurper().parse(reader)
        
        if (!json.requests || json.requests.isEmpty()) {
            throw new Exception("No requests found in reject payload")
        }
        
        def firstReq = json.requests[0]
        batchId = pick(firstReq.batch_id, firstReq.batchId, firstReq.BatchId)
        def reqId = pick(firstReq.po_req_id, firstReq.requestId, batchId)
        def preqNo = pick(firstReq.preq_no, firstReq.preqNo, firstReq.PreqNo, "")
        def rejectedBy = pick(firstReq.rejected_by, firstReq.rejectedBy, firstReq.RejectedBy, "")
        def rootRejectReason = pick(firstReq.reject_reason, firstReq.rejectReason, firstReq.message, "Rejected by Purchasing Group")
        
        def capStatus = "ERROR"
        def callbackStep = "Purchasing Group Rejected"
        def callbackSource = "PURCHASING_REJECT"
        
        // Format message đẹp hơn
        def displayMessage = "[Purchasing Reject] PR: ${preqNo} | By: ${rejectedBy} | ${rootRejectReason}"
        
        def itemsList = json.requests.collect { r ->
            def rId = pick(r.po_req_id, r.requestId, reqId)
            def rPreqNo = pick(r.preq_no, r.preqNo, r.PreqNo, preqNo)
            def rReason = pick(r.reject_reason, r.rejectReason, r.message, rootRejectReason)
            def rRejectedBy = pick(r.rejected_by, r.rejectedBy, r.RejectedBy, rejectedBy)
            
            [
                batchId       : pick(r.batch_id, batchId),
                requestId     : rId,
                quotationNo   : "",
                salesOrder    : "",
                deliveryDoc   : "",
                billingDoc    : "",
                status        : capStatus,
                callbackStatus: capStatus,
                callbackStep  : callbackStep,
                message       : "[Purchasing Reject] PR: ${rPreqNo} | By: ${rRejectedBy} | ${rReason}"
            ]
        }
        
        // Build payload cho upsertQuotationProgress
        def capPayload = [
            batchId           : batchId,
            requestId         : reqId,
            quotationNo       : "",
            salesOrder        : "",
            deliveryDoc       : "",
            billingDoc        : "",
            callbackSource    : callbackSource,
            callbackStatus    : capStatus,
            status            : capStatus,
            callbackStep      : callbackStep,
            workflowInstanceId: "",
            fileType          : "REJECT",
            uploadType        : "PURCHASING_REJECT",
            createdBy         : rejectedBy,  // Gửi vào createdBy để hiển thị Upload By
            message           : displayMessage,
            items             : itemsList,
            payload           : JsonOutput.toJson([
                preqNo        : preqNo,
                rejectReason  : rootRejectReason,
                rejectedBy    : rejectedBy,
                originalStatus: pick(firstReq.status, "REJECTED"),
                totalRejected : itemsList.size(),
                source        : "PURCHASING_GROUP"
            ])
        ]
        
        message.setProperty("capRoute", "OK")
        message.setHeader("CamelHttpMethod", "POST")
        message.setHeader("Content-Type", "application/json")
        message.setHeader("Accept", "application/json")
        message.setBody(JsonOutput.toJson(capPayload))
        
        return message
        
    } catch (Exception ex) {
        def err = pick(ex?.message, "Reject transform error")
        def displayErr = "[Purchasing Reject] Transform Error: ${err}"
        
        def fallbackPayload = [
            batchId           : batchId,
            requestId         : batchId,
            quotationNo       : "",
            salesOrder        : "",
            deliveryDoc       : "",
            billingDoc        : "",
            callbackSource    : "PURCHASING_REJECT",
            callbackStatus    : "ERROR",
            status            : "ERROR",
            callbackStep      : "Purchasing Reject Transform Failed",
            workflowInstanceId: "",
            fileType          : "REJECT",
            uploadType        : "PURCHASING_REJECT",
            createdBy         : "",
            message           : displayErr,
            items             : [],
            payload           : JsonOutput.toJson([
                transformError: true,
                error         : err
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
