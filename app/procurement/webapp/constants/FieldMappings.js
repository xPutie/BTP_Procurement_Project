sap.ui.define([], function () {
    "use strict";

    return {
        // CSV/Excel Header Field Mappings (multiple aliases for each field)
        ORDER_FIELDS: {
            flowType: ["flowType", "FlowType", "flow_type", "FLOWTYPE", "type", "Type", "loai", "Loai"],
            customerId: ["customerId", "CustomerId", "customer_id", "CUSTOMER", "soldTo", "SoldTo", "partner", "Partner"],
            customerName: ["customerName", "CustomerName", "customer_name", "CUSTOMERNAME", "partnerName", "PartnerName"],
            material: ["material", "Material", "matnr", "MATNR", "partNo", "PartNo", "product", "Product"],
            description: ["description", "Description", "desc", "Desc", "materialDesc", "MaterialDesc", "text", "Text"],
            quantity: ["quantity", "Quantity", "qty", "Qty", "orderQty", "OrderQty", "soLuong", "SoLuong"],
            unit: ["unit", "Unit", "uom", "UOM", "salesUnit", "SalesUnit", "baseUom", "BaseUom", "dvt", "DVT"],
            plant: ["plant", "Plant", "werks", "WERKS", "factory", "Factory", "nhaMay", "NhaMay"],
            storageLocation: ["storLoc", "StorLoc", "storageLocation", "StorageLoc", "lgort", "LGORT", "kho", "Kho"],
            deliveryDate: ["deliveryDate", "DeliveryDate", "delivDate", "DelivDate", "reqDate", "ReqDate", "ngayGiao", "NgayGiao"],
            netPrice: ["netPrice", "NetPrice", "price", "Price", "donGia", "DonGia"],
            currency: ["currency", "Currency", "waers", "WAERS", "curr", "Curr", "tienTe", "TienTe"],
            taxAmount: ["taxAmount", "TaxAmount", "tax", "Tax", "thue", "Thue"],
            grossValue: ["grossValue", "GrossValue", "gross", "Gross", "tongGia", "TongGia"],
            incoterms: ["incoterms", "Incoterms", "inco", "Inco"],
            paymentTerm: ["paymentTerm", "PaymentTerm", "pmnttrms", "Pmnttrms", "thanhToan", "ThanhToan"],
            reference: ["reference", "Reference", "ref", "Ref", "purchNoC", "PurchNoC"],
            itemNo: ["itemNo", "ItemNo", "item", "Item", "lineNo", "LineNo", "lineItem", "LineItem", "stt", "STT"],
            salesOrder: ["salesOrder", "SalesOrder", "so", "SO", "donHang", "DonHang"],
            quotationNo: ["quotationNo", "QuotationNo", "quotation", "Quotation", "baoGia", "BaoGia"],
            validFrom: ["validFrom", "ValidFrom", "valid_from", "fromDate", "FromDate", "tuNgay", "TuNgay"],
            validTo: ["validTo", "ValidTo", "valid_to", "toDate", "ToDate", "denNgay", "DenNgay"],
            shipPoint: ["shipPoint", "ShipPoint", "shippingPoint", "ShippingPoint", "diemGiao", "DiemGiao"]
        },

        // JSON Payload Field Mappings
        PAYLOAD_FIELDS: {
            requestId: ["requestId", "RequestId", "request_id", "guid", "GUID"],
            workflowInstanceId: ["workflowInstanceId", "WorkflowInstanceId", "workflow_id", "correlationId"],
            callbackStep: ["callbackStep", "CallbackStep", "step", "Step"],
            documentNo: ["documentNo", "DocumentNo", "docNo", "DocNo", "vbeln", "VBELN"],
            itemDocumentNo: ["itemDocNo", "ItemDocNo", "posnr", "POSNR"],
            statusCode: ["statusCode", "StatusCode", "status", "Status", "code", "Code"],
            statusText: ["statusText", "StatusText", "message", "Message", "msg", "Msg"]
        },

        // Document Type Icons
        DOC_ICONS: {
            Quotation: "sap-icon://crm-sales",
            SalesOrder: "sap-icon://sales-order",
            Delivery: "sap-icon://shipping-status",
            Billing: "sap-icon://payment-approval",
            PR: "sap-icon://request",
            PO: "sap-icon://purchase-order",
            GR: "sap-icon://retail-store"
        },

        // Status State Mappings
        STATUS_STATES: {
            "Completed": "Success",
            "Success": "Success",
            "Error": "Error",
            "Failed": "Error",
            "Pending": "Information",
            "Processing": "Information",
            "Running": "Information",
            "Cancelled": "Warning"
        },

        // Color codes for status
        STATUS_COLORS: {
            "Success": "#107e3e",
            "Error": "#e01010",
            "Pending": "#0070f2",
            "Processing": "#f58c28",
            "Warning": "#f58c28"
        }
    };
});
