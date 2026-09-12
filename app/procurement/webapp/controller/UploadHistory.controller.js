sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "../util/DateUtils"
], function (BaseController, JSONModel, MessageToast, DateUtils) {
    "use strict";

    return BaseController.extend("com.gsp.sap.procurement.ui.poautomationui.controller.UploadHistory", {
        onInit: function () {
            this._isLoadingHistory = false;

            var oModel = new JSONModel({
                sdRecords: [],
                mmRecords: []
            });
            this.getView().setModel(oModel, "history");

            this.getRouter().getRoute("uploadHistory").attachPatternMatched(this._onRouteMatched, this);
        },

        _onRouteMatched: function () {
            this._loadHistory();
        },

        onNavBack: function () {
            this.getRouter().navTo("upload");
        },

        onRefreshHistory: function () {
            this._loadHistory();
            MessageToast.show("Đã làm mới lịch sử upload");
        },

        _getProcurementServiceBaseUrl: function () {
            var oModel = this.getView() && this.getView().getModel();
            var sServiceUrl = oModel && (oModel.sServiceUrl || (typeof oModel.getServiceUrl === "function" ? oModel.getServiceUrl() : ""));
            var sFallback = "/srv-api/odata/v4/procurement/";
            return String(sServiceUrl || sFallback);
        },

        _buildProcurementServiceUrl: function (sRelativePath) {
            var sBase = this._getProcurementServiceBaseUrl().replace(/\/+$/, "");
            var sPath = String(sRelativePath || "").replace(/^\/+/, "");
            return sPath ? (sBase + "/" + sPath) : (sBase + "/");
        },

        _loadHistory: function () {
            var that = this;

            if (this._isLoadingHistory) {
                return;
            }
            this._isLoadingHistory = true;

            this._fetchApiJson(this._buildProcurementServiceUrl("UploadHistory?$orderby=createdAt desc&$top=200"))
                .then(function (data) {
                    var aRows = (data && data.value) ? data.value : [];
                    var aMapped = aRows.map(function (row) {
                        var sMethod = row.uploadMethod || "Unknown";
                        var sIcon = sMethod === "JSON" ? "sap-icon://document-text" : "sap-icon://excel-attachment";
                        var sIconName = sMethod === "JSON" ? "JSON Upload" : "CSV/Excel Upload";
                        var sStatus = row.statusText || "Không rõ";
                        var sState = sStatus === "Thành công"
                            ? "Success"
                            : (sStatus === "Đang xử lý" ? "Information" : (sStatus === "Một phần" ? "Warning" : "Error"));

                        return {
                            ID: row.ID,
                            createdAtText: DateUtils.formatDisplayDateTime(row.createdAt),
                            uploadMethod: sMethod,
                            methodIcon: sIcon,
                            methodIconName: sIconName,
                            totalRows: row.totalRows || 0,
                            successRows: row.successRows || 0,
                            failRows: row.failRows || 0,
                            salesOrders: row.salesOrders || 0,
                            deliveries: row.deliveries || 0,
                            billings: row.billings || 0,
                            salesOrderCodes: row.salesOrderCodes || "-",
                            deliveryCodes: row.deliveryCodes || "-",
                            billingCodes: row.billingCodes || "-",
                            batchIds: row.batchIds || row.batchId || "-",
                            processType: row.processType || "SD_OTC",
                            statusText: sStatus,
                            statusState: sState,
                            createdBy: row.createdBy || "anonymous"
                        };
                    });

                    var aSD = aMapped.filter(function (r) { return r.processType === "SD_OTC"; });
                    var aMM = aMapped.filter(function (r) { return r.processType === "MM_P2P"; });

                    that.getView().getModel("history").setProperty("/sdRecords", aSD);
                    that.getView().getModel("history").setProperty("/mmRecords", aMM);
                })
                .catch(function (error) {
                    MessageToast.show("Không tải được lịch sử: " + (error.message || "Unknown error"));
                })
                .finally(function () {
                    that._isLoadingHistory = false;
                });
        }
    });
});
