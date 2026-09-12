sap.ui.define([
    "sap/ui/model/json/JSONModel",
    "sap/ui/Device"
], 
function (JSONModel, Device) {
    "use strict";

    /**
     * @namespace com.gsp.sap.procurement.ui.poautomationui.model.models
     */
    var oModels = {
        /**
         * Provides runtime information for the device the UI5 app is running on as a JSONModel.
         * @public
         * @function
         * @returns {sap.ui.model.json.JSONModel} The device model.
         */
        createDeviceModel: function () {
            var oModel = new JSONModel(Device);
            oModel.setDefaultBindingMode("OneWay");
            return oModel;
        },

        /**
         * Creates the global Upload Model for persisting state.
         * @public
         * @function
         * @returns {sap.ui.model.json.JSONModel} The upload model.
         */
        createUploadModel: function () {
            var oModel = new JSONModel({
                // Wizard step states (boolean-based)
                step1Active: true,  step1Done: false,
                step2Active: false, step2Done: false,
                step3Active: false, step3Done: false,
                step4Active: false, step4Done: false,

                // Preview table
                tableVisible: false,
                tableData: [],
                canExecute: false,

                // JSON upload sidebar state
                jsonInput: "",
                jsonValidationVisible: false,
                jsonValidationText: "",
                jsonValidationType: "None",
                jsonTableVisible: false,
                jsonTableData: [],
                jsonCanExecute: false,

                // CSV default fields (with Incoterms1 and PaymentTerms)
                jsonDefaultSalesOrg: "ND01",
                jsonDefaultDistrChan: "DI",
                jsonDefaultDivision: "AU",
                jsonDefaultDocType: "QT",
                jsonDefaultPlant: "ND01",
                jsonDefaultStorLoc: "TG01",
                jsonDefaultIncoterms1: "DAP",
                jsonDefaultPaymentTerms: "NT30",
                csvDefaultSalesOrgError: false,
                csvDefaultDistrChanError: false,
                csvDefaultDivisionError: false,
                csvDefaultDocTypeError: false,
                csvDefaultPlantError: false,
                csvDefaultStorLocError: false,
                csvDefaultIncoterms1Error: false,
                csvDefaultPaymentTermsError: false,

                // Sidebar requirement checks
                reqFormatIcon: "sap-icon://status-inactive", reqFormatColor: "#6a6d70",
                reqSizeIcon: "sap-icon://status-inactive", reqSizeColor: "#6a6d70",
                reqStructureIcon: "sap-icon://status-inactive", reqStructureColor: "#6a6d70",

                // Result panel
                resultVisible: false,
                resultBannerText: "",
                resultBannerType: "Success",
                resultTotal: "0",
                resultPendingCount: "0",
                resultBatchCount: "0",
                resultSOCount: "0",
                resultDLCount: "0",
                resultBLCount: "0",
                resultFilterQuery: "",
                resultFilterStatus: "ALL",
                resultAllData: [],
                resultData: [],
                resultTimestamp: ""
            });
            oModel.setDefaultBindingMode("TwoWay");
            return oModel;
        }
    };

    return oModels;

});