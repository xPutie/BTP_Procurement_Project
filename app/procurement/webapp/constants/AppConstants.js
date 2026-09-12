sap.ui.define([], function () {
    "use strict";

    return {
        // App Configuration
        APP_NAME: "Procurement Order Automation",
        APP_VERSION: "1.0.0",
        
        // Storage Keys
        STORAGE: {
            AUTH_KEY: "po.procurement.staff.auth",
            MAX_SESSION_AGE_MS: 12 * 60 * 60 * 1000, // 12 hours
            UPLOAD_STATE: "_uploadState",
            CSV_CONTENT: "_lastRawCSVContent",
            CSV_FILENAME: "_lastUploadedFileName",
            CSV_IS_CSV: "_lastIsCSVFile"
        },

        // Flow Types
        FLOW_TYPE: {
            SALES: "Sales",
            ORDER_TO_CASH: "Order-to-Cash",
            O2C: "O2C",
            PROCUREMENT: "Procurement",
            MAKE_TO_ORDER: "Make-to-Order",
            MTO: "MTO"
        },

        // Document Types
        DOC_TYPE: {
            QUOTATION: "Quotation",
            SALES_ORDER: "SalesOrder",
            DELIVERY: "Delivery",
            BILLING: "Billing",
            PR: "PR",
            PO: "PO",
            GR: "GR"
        },

        // Status Codes
        STATUS: {
            PENDING: "Pending",
            PROCESSING: "Processing",
            COMPLETED: "Completed",
            ERROR: "Error",
            SUCCESS: "Success",
            CANCELLED: "Cancelled"
        },

        // API Configuration
        API: {
            CPI_TIMEOUT_MS: 300000, // 5 minutes
            BATCH_TIMEOUT_BASE_MS: 130000,
            MAX_RETRY_COUNT: 3,
            RETRY_DELAY_MS: 2000
        },

        // Validation
        VALIDATION: {
            MAX_FILE_SIZE_MB: 10,
            ALLOWED_EXTENSIONS: [".csv", ".xlsx", ".xls", ".json"],
            CSV_MIME_TYPES: ["text/csv", "application/csv", "text/plain"],
            EXCEL_MIME_TYPES: [
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                "application/vnd.ms-excel"
            ]
        },

        // UI Configuration
        UI: {
            TABLE_PAGE_SIZE: 50,
            MAX_VISIBLE_ROWS: 100,
            DIALOG_WIDTH: "1000px",
            DIALOG_HEIGHT: "85vh",
            TOAST_DURATION_MS: 3000
        },

        // Date Formats
        DATE_FORMAT: {
            DISPLAY: "dd/MM/yyyy",
            DISPLAY_DATETIME: "dd/MM/yyyy HH:mm:ss",
            ISO: "yyyy-MM-dd",
            SAP: "yyyyMMdd"
        },

        // Currency
        CURRENCY: {
            DEFAULT: "VND",
            DECIMAL_PLACES: 0,
            THOUSAND_SEPARATOR: ".",
            DECIMAL_SEPARATOR: ","
        }
    };
});
