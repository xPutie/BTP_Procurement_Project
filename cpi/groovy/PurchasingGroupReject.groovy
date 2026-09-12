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
        
        // Nhóm requests theo batchId+preqNo để tránh duplicate calls
        def batchGroups = [:]
        json.requests.each { r ->
            def bId = pick(r.batch_id, r.batchId, r.BatchId)
            def pNo = pick(r.preq_no, r.preqNo, r.PreqNo, "")
            def key = "${bId}#${pNo}"
            
            if (!batchGroups.containsKey(key)) {
                batchGroups[key] = [
                    batchId     : bId,
                    preqNo      : pNo,
                    requestId   : pick(r.po_req_id, r.requestId, bId),
                    rejectReason: pick(r.reject_reason, r.rejectReason, r.message, "Rejected by Purchasing Group"),
                    rejectedBy  : pick(r.rejected_by, r.rejectedBy, r.RejectedBy, "")
                ]
            }
        }
        
        // Lấy thông tin từ phần tử đầu tiên làm header
        def firstEntry = batchGroups.values()[0]
        batchId = firstEntry.batchId
        def reqId = firstEntry.requestId
        def preqNo = firstEntry.preqNo
        def rejectedBy = firstEntry.rejectedBy
        def rootRejectReason = firstEntry.rejectReason
        
        def capStatus = "ERROR"
        def callbackStep = "Purchasing Group Rejected"
        def callbackSource = "PURCHASING_REJECT"
        
        // Build items list từ unique entries
        def allPreqNos = []
        def itemsList = []
        
        batchGroups.each { key, r ->
            allPreqNos << r.preqNo
            itemsList << [
                batchId       : r.batchId,
                requestId     : r.requestId,
                quotationNo   : "",
                salesOrder    : "",
                deliveryDoc   : "",
                billingDoc    : "",
                status        : capStatus,
                callbackStatus: capStatus,
                callbackStep  : callbackStep,
                message       : "[Purchasing Reject] PR: ${r.preqNo} | By: ${r.rejectedBy} | ${r.rejectReason}"
            ]
        }
        
        // Format message tổng quan
        def displayMessage = allPreqNos.size() > 1
            ? "[Purchasing Reject] ${allPreqNos.size()} PRs rejected | By: ${rejectedBy}"
            : "[Purchasing Reject] PR: ${preqNo} | By: ${rejectedBy} | ${rootRejectReason}"
        
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
            fileType          : "",
            uploadType        : "",
            message           : displayMessage,
            items             : itemsList,
            payload           : JsonOutput.toJson([
                preqNos       : allPreqNos,
                rejectReason  : rootRejectReason,
                rejectedBy    : rejectedBy,
                originalStatus: pick(firstEntry.originalStatus, "REJECTED"),
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
            batchId           : "",
            requestId         : "",
            quotationNo       : "",
            salesOrder        : "",
            deliveryDoc       : "",
            billingDoc        : "",
            callbackSource    : "PURCHASING_REJECT",
            callbackStatus    : "ERROR",
            status            : "ERROR",
            callbackStep      : "Purchasing Reject Transform Failed",
            workflowInstanceId: "",
            fileType          : "",
            uploadType        : "",
            requesterEmail    : "",
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
