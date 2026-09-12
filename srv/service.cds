using com.gsp.sap.procurement from '../db/schema';

@(requires: 'any')
service ProcurementService {
    entity Orders as projection on procurement.Orders;
    entity UploadHistory as projection on procurement.UploadHistory;
    entity ProcessingQuotations as projection on procurement.ProcessingQuotations;

    @(requires: 'any')
    action loginStaff(username: String, password: String) returns {
        success: Boolean;
        message: String;
        email: String;
        fullName: String;
        role: String;
    };
    
    // Actions
    action importOrders(fileContent: LargeString, flowType: String) returns array of Orders;
    
    // Direct CPI call — receives JSON payload string, forwards to CPI, returns result
    action sendToCPI(payload: LargeString) returns {
        salesOrder: String;
        delivery: String;
        billing: String;
        batchId: String;
        currentIFlow: String;
        status: String;
        message: String;
        responsePayload: LargeString;
        material: String;
        quantity: Integer;
        timestamp: String;
    };

    action sendToCPIAsync(
        payload: LargeString,
        uploadType: String,
        fileType: String,
        payloadType: String,
        fileName: String
    ) returns {
        requestId: String;
        batchId: String;
        currentIFlow: String;
        status: String;
        message: String;
        responsePayload: LargeString;
        timestamp: String;
    };

    action upsertWarehouseProgress(
        batchId: String,
        quotationNo: String,
        salesOrder: String,
        deliveryDoc: String,
        billingDoc: String,
        workflowInstanceId: String,
        warehouseStatus: String,
        warehouseMessage: String,
        message: String
    ) returns {
        ID: String;
        statusCode: String;
        statusText: String;
        currentStage: String;
        updatedAt: String;
        message: String;
    };

    action upsertQuotationProgress(
        batchId: String,
        quotationNo: String,
        salesOrder: String,
        deliveryDoc: String,
        billingDoc: String,
        poNumber: String,
        poItem: String,
        preqNo: String,
        preqItem: String,
        expectedPoCount: Integer,
        callbackSource: String,
        callbackStatus: String,
        status: String,
        callbackStep: String,
        workflowInstanceId: String,
        requestId: String,
        requesterEmail: String,
        fileType: String,
        uploadType: String,
        payload: LargeString,
        message: String,
        items: array of {
            batchId: String;
            quotationNo: String;
            salesOrder: String;
            deliveryDoc: String;
            billingDoc: String;
            poNumber: String;
            poItem: String;
            preqNo: String;
            preqItem: String;
            status: String;
            callbackStatus: String;
            callbackStep: String;
            message: String;
            requestId: String;
            requesterEmail: String;
        }
    ) returns {
        ID: String;
        statusCode: String;
        statusText: String;
        currentStage: String;
        updatedAt: String;
        message: String;
    };

    action upsertProcurementProgress(
        batchId: String,
        quotationNo: String,
        salesOrder: String,
        poNumber: String,
        poItem: String,
        preqNo: String,
        preqItem: String,
        expectedPoCount: Integer,
        payload: LargeString,
        status: String,
        message: String
    ) returns {
        ID: String;
        statusCode: String;
        statusText: String;
        currentStage: String;
        updatedAt: String;
        message: String;
    };
    
    // CPI Integration Actions
    action createSDWithDelivery(
        orderId: String,
        customer: String,
        salesOrg: String,
        items: array of {
            material: String;
            description: String;
            quantity: Integer;
            unit: String;
            price: Decimal;
            plant: String;
        }
    ) returns {
        salesOrder: String;
        delivery: String;
        status: String;
        message: String;
    };
    
    action createSDFullChain(
        orderId: String,
        customer: String,
        salesOrg: String,
        items: array of {
            material: String;
            description: String;
            quantity: Integer;
            unit: String;
            price: Decimal;
            plant: String;
        }
    ) returns {
        salesOrder: String;
        delivery: String;
        billing: String;
        status: String;
        message: String;
    };
    
    action createMMFullChain(
        orderId: String,
        prType: String,
        items: array of {
            material: String;
            quantity: Integer;
            unit: String;
            plant: String;
            deliveryDate: String;
            vendor: String;
        }
    ) returns {
        salesOrder: String;
        purchaseRequisition: String;
        purchaseOrder: String;
        status: String;
        message: String;
    };
    
    action importFromJSON(data: LargeString) returns {
        ordersCreated: Integer;
    };

    // Template Generation
    function getTemplate(flowType: String) returns {
        content: LargeString;
        fileName: String;
        fileType: String;
        status: String;
    };
}
