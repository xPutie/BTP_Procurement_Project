sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/BusyDialog",
    "sap/m/MessageBox",
    "sap/m/Dialog",
    "sap/m/Button",
    "sap/m/Table",
    "sap/m/Column",
    "sap/m/ColumnListItem",
    "sap/m/Text",
    "sap/m/ObjectIdentifier",
    "sap/m/ObjectStatus",
    "sap/m/ObjectNumber",
    "sap/m/TextArea",
    "sap/m/Label",
    "../util/DateUtils"
], function (BaseController, JSONModel, MessageToast, BusyDialog, MessageBox, Dialog, Button, Table, Column, ColumnListItem, Text, ObjectIdentifier, ObjectStatus, ObjectNumber, TextArea, Label, DateUtils) {
    "use strict";

    return BaseController.extend("com.gsp.sap.procurement.ui.poautomationui.controller.Upload", {

        /* ── Private state ── */
        _storedFile: null,
        _storedBase64: null,
        _parsedExcelRows: null,
        _parsedExcelOrders: null,
        _parsedJSONOrders: null,
        _parsedJSONRoot: null,
        _jsonInputShape: "orders",
        _resultAllData: null,
        _quotationExpandState: null,
        _cpiCancelled: false,
        _skipUploadSetRemoveReset: false,
        _resultRefreshTimer: null,
        _activeResultScope: null,
        _activeUploadStartedAt: null,
        _isRestoringResults: false,
        _isLoadingPendingCount: false,

        /* ══════════════════════════════════════
           INIT
           ══════════════════════════════════════ */
        onInit: function () {
            var oUploadModel = this.getOwnerComponent().getModel("uploadModel");
            this.getView().setModel(oUploadModel, "status");
            
            // Initialize upload mode
            var oModel = this.getView().getModel("status");
            if (!oModel.getProperty("/uploadMode")) {
                oModel.setProperty("/uploadMode", "excel");
            }
            
            // Initialize JSON properties
            oModel.setProperty("/jsonInput", "");
            oModel.setProperty("/jsonValidationVisible", false);
            oModel.setProperty("/jsonValidationText", "");
            oModel.setProperty("/jsonValidationType", "None");
            oModel.setProperty("/jsonTableVisible", false);
            oModel.setProperty("/jsonTableData", []);
            oModel.setProperty("/jsonPreviewSummary", "Empty");
            oModel.setProperty("/jsonCanExecute", false);
            oModel.setProperty("/jsonDefaultSalesOrg", oModel.getProperty("/jsonDefaultSalesOrg") || "ND01");
            oModel.setProperty("/jsonDefaultDistrChan", oModel.getProperty("/jsonDefaultDistrChan") || "DI");
            oModel.setProperty("/jsonDefaultDivision", oModel.getProperty("/jsonDefaultDivision") || "AU");
            oModel.setProperty("/jsonDefaultDocType", oModel.getProperty("/jsonDefaultDocType") || "QT");
            oModel.setProperty("/jsonDefaultPlant", oModel.getProperty("/jsonDefaultPlant") || "ND01");
            oModel.setProperty("/jsonDefaultStorLoc", oModel.getProperty("/jsonDefaultStorLoc") || "TG01");
            // Date defaults - initialize with today's date
            var today = new Date();
            var todayStr = this._formatISODate(today);
            var next4Months = new Date(today);
            next4Months.setMonth(next4Months.getMonth() + 4);
            var next4MonthsStr = this._formatISODate(next4Months);
            oModel.setProperty("/jsonDefaultValidFrom", oModel.getProperty("/jsonDefaultValidFrom") || todayStr);
            oModel.setProperty("/jsonDefaultValidTo", oModel.getProperty("/jsonDefaultValidTo") || next4MonthsStr);
            oModel.setProperty("/jsonDefaultPriceDate", oModel.getProperty("/jsonDefaultPriceDate") || todayStr);
            oModel.setProperty("/csvDefaultSalesOrgError", false);
            oModel.setProperty("/csvDefaultDistrChanError", false);
            oModel.setProperty("/csvDefaultDivisionError", false);
            oModel.setProperty("/csvDefaultDocTypeError", false);
            oModel.setProperty("/csvDefaultPlantError", false);
            oModel.setProperty("/csvDefaultStorLocError", false);
            oModel.setProperty("/csvDefaultValidFromError", false);
            oModel.setProperty("/csvDefaultValidToError", false);
            oModel.setProperty("/csvDefaultPriceDateError", false);
            oModel.setProperty("/csvDefaultPriceDatePastError", false);
            oModel.setProperty("/csvDefaultDateRangeError", false);
            oModel.setProperty("/csvValidationText", "");
            oModel.setProperty("/csvPendingChanges", false);
            oModel.setProperty("/defaultFieldsPending", false);
            oModel.setProperty("/materialConfigPending", false);
            oModel.setProperty("/deliveryLeadO2CError", false);
            oModel.setProperty("/deliveryLeadMTOError", false);

            // Initialize Material-ProcessType configuration
            var aMaterialConfig = oModel.getProperty("/materialProcessTypeConfig");
            if (!Array.isArray(aMaterialConfig) || aMaterialConfig.length === 0) {
                aMaterialConfig = [
                    { material: "EV_MOTOR_01", processType: "Make-to-Order" },
                    { material: "WILA_TIRE_01", processType: "Order-to-Cash" }
                ];
            }
            oModel.setProperty("/materialProcessTypeConfig", aMaterialConfig);
            oModel.setProperty(
                "/materialProcessTypeConfigDraft",
                aMaterialConfig.map(function (oItem) {
                    return {
                        material: String(oItem.material || "").trim(),
                        processType: String(oItem.processType || "Order-to-Cash").trim() || "Order-to-Cash"
                    };
                })
            );

            var nLeadO2C = parseInt(oModel.getProperty("/deliveryLeadMonthsO2C"), 10);
            var nLeadMTO = parseInt(oModel.getProperty("/deliveryLeadMonthsMTO"), 10);
            if (!Number.isFinite(nLeadO2C) || nLeadO2C <= 0) {
                nLeadO2C = 1;
            }
            if (!Number.isFinite(nLeadMTO) || nLeadMTO <= 0) {
                nLeadMTO = 3;
            }
            oModel.setProperty("/deliveryLeadMonthsO2C", nLeadO2C);
            oModel.setProperty("/deliveryLeadMonthsMTO", nLeadMTO);
            oModel.setProperty("/deliveryLeadMonthsO2CDraft", nLeadO2C);
            oModel.setProperty("/deliveryLeadMonthsMTODraft", nLeadMTO);
            oModel.setProperty("/csvValidationType", "None");

            var sModelUserEmail = String(this.getOwnerComponent().getModel("app")?.getProperty("/userEmail") || "").trim();
            oModel.setProperty(
                "/jsonDefaultRequesterEmail",
                oModel.getProperty("/jsonDefaultRequesterEmail") || sModelUserEmail || "toanncse182505@fpt.edu.vn"
            );
            oModel.setProperty("/resultFilterQuery", "");
            oModel.setProperty("/resultFilterStatus", "ALL");
            oModel.setProperty("/resultFlowType", "ALL");
            oModel.setProperty("/resultPendingCount", "0");
            oModel.setProperty("/resultBatchCount", "0");
            oModel.setProperty("/resultAllData", []);
            oModel.setProperty("/pendingQuotationCount", 0);
            this._resultAllData = [];
            this._quotationExpandState = {};

            this._activeResultScope = null;
            this._activeUploadStartedAt = null;
            this._jsonInputShape = "orders";
            this._parsedJSONRoot = null;
            this._isRestoringResults = false;
            this._isLoadingPendingCount = false;

            this.getRouter().getRoute("upload").attachPatternMatched(this._onUploadRouteMatched, this);

            // Initialize default JSON format sample
            if (!oModel.getProperty("/jsonFormatSample")) {
                oModel.setProperty("/jsonFormatSample", JSON.stringify({
                    "Orders": [
                        {
                            "SoldToParty": "1000058",
                            "ProcessType": "Order-to-Cash",
                            "ItemLine": {
                                "item": [
                                    {
                                        "Material": "EV_MOTOR_01",
                                        "Quantity": "3.000",
                                        "Unit": "EA",
                                        "DeliveryDate": "2026-05-11"
                                    }
                                ]
                            }
                        }
                    ]
                }, null, 2));
            }

        },

        onExit: function () {
            this._stopResultAutoRefresh();
        },

        /* ══════════════════════════════════════
           TAB NAVIGATION
           ══════════════════════════════════════ */
        onUploadModeChange: function(oEvent) {
            var sSelectedKey = oEvent.getParameter("item").getKey();
            var oModel = this.getView().getModel("status");
            oModel.setProperty("/uploadMode", sSelectedKey);
            
            // Reset states when switching tabs
            if (sSelectedKey === "json") {
                this._resetJSONState();
            } else {
                this._resetState();
            }
        },

        /* ══════════════════════════════════════
           1. NAVIGATION
           ══════════════════════════════════════ */
        onNavBack: function() {
            this.getRouter().navTo("upload", {}, true);
        },

        onGoLanding: function () {
            this.getRouter().navTo("landing");
        },

        onGoUploadHistory: function () {
            this.getRouter().navTo("uploadHistory");
        },

        onGoProcessingMonitor: function () {
            this.getRouter().navTo("processingMonitor");
        },

        _navigateToProcessingMonitor: function () {
            // Navigate to Monitor immediately after upload completes.
            this.getRouter().navTo("processingMonitor");
        },

        _onUploadRouteMatched: function () {
            this._stopResultAutoRefresh();
            this._resultAllData = [];
            this._quotationExpandState = {};
            this._activeResultScope = null;
            this._activeUploadStartedAt = null;

            var oModel = this.getView().getModel("status");
            if (!oModel) {
                return;
            }

            oModel.setProperty("/resultVisible", false);
            oModel.setProperty("/resultData", []);
            oModel.setProperty("/resultAllData", []);
            oModel.setProperty("/resultPendingCount", "0");
            oModel.setProperty("/resultBatchCount", "0");
            oModel.setProperty("/pendingQuotationCount", 0);
        },

        _beginResultSession: function () {
            this._activeUploadStartedAt = new Date().toISOString();
            this._activeResultScope = null;
            this._quotationExpandState = {};
            this._resultAllData = [];

            var oModel = this.getView().getModel("status");
            if (!oModel) {
                return;
            }

            oModel.setProperty("/resultVisible", false);
            oModel.setProperty("/resultData", []);
            oModel.setProperty("/resultAllData", []);
            oModel.setProperty("/resultPendingCount", "0");
            oModel.setProperty("/resultBatchCount", "0");
            oModel.setProperty("/pendingQuotationCount", 0);
        },

        _isRealScopeIdentifier: function (vValue) {
            var sValue = String(vValue || "").trim();
            if (!sValue) {
                return false;
            }

            var sUpper = sValue.toUpperCase();
            if (sUpper === "-" || sUpper === "N/A") {
                return false;
            }

            if (
                sUpper.indexOf("ROW_") === 0 ||
                sUpper.indexOf("QUOTATION_") === 0 ||
                sUpper.indexOf("NO_BATCH") === 0 ||
                sUpper.indexOf("NO_QUOTATION") === 0
            ) {
                return false;
            }

            return true;
        },

        _captureActiveResultScope: function (aRows) {
            var mBatchIds = {};
            var mQuotationNos = {};
            var mSalesOrders = {};
            var mDeliveries = {};

            (Array.isArray(aRows) ? aRows : []).forEach(function (oRow) {
                if (!oRow || oRow.isChildItem) {
                    return;
                }

                var sBatch = String(oRow.batchId || "").trim();
                var sQuotation = String(oRow.quotationNo || oRow.quotation || "").trim();
                var sSalesOrder = String(oRow.salesOrder || "").trim();
                var sDelivery = String(oRow.delivery || oRow.deliveryDoc || "").trim();

                if (this._isRealScopeIdentifier(sBatch)) {
                    mBatchIds[sBatch.toUpperCase()] = true;
                }
                if (this._isRealScopeIdentifier(sQuotation)) {
                    mQuotationNos[sQuotation.toUpperCase()] = true;
                }
                if (this._isRealScopeIdentifier(sSalesOrder)) {
                    mSalesOrders[sSalesOrder.toUpperCase()] = true;
                }
                if (this._isRealScopeIdentifier(sDelivery)) {
                    mDeliveries[sDelivery.toUpperCase()] = true;
                }
            }.bind(this));

            this._activeResultScope = {
                batchIds: mBatchIds,
                quotationNos: mQuotationNos,
                salesOrders: mSalesOrders,
                deliveries: mDeliveries
            };
        },

        _hasActiveResultScope: function () {
            var oScope = this._activeResultScope || {};
            var bHasExplicitScope = Object.keys(oScope.batchIds || {}).length > 0
                || Object.keys(oScope.quotationNos || {}).length > 0
                || Object.keys(oScope.salesOrders || {}).length > 0
                || Object.keys(oScope.deliveries || {}).length > 0;

            // Fallback: if we have no explicit identifiers yet, still allow refresh by upload time window.
            return bHasExplicitScope || !!String(this._activeUploadStartedAt || "").trim();
        },

        _matchesActiveResultScope: function (oRecord) {
            var oScope = this._activeResultScope || {};
            var rec = oRecord || {};

            var sBatch = String(rec.batchId || "").trim().toUpperCase();
            var sQuotation = String(rec.quotationNo || "").trim().toUpperCase();
            var sSalesOrder = String(rec.salesOrder || "").trim().toUpperCase();
            var sDelivery = String(rec.delivery || rec.deliveryDoc || "").trim().toUpperCase();

            var bHasExplicitScope = Object.keys(oScope.batchIds || {}).length > 0
                || Object.keys(oScope.quotationNos || {}).length > 0
                || Object.keys(oScope.salesOrders || {}).length > 0
                || Object.keys(oScope.deliveries || {}).length > 0;

            if (!bHasExplicitScope) {
                // If identifiers are not available yet, rely on upload time-window filtering.
                return true;
            }

            if (sBatch && oScope.batchIds && oScope.batchIds[sBatch]) {
                return true;
            }
            if (sQuotation && oScope.quotationNos && oScope.quotationNos[sQuotation]) {
                return true;
            }
            if (sSalesOrder && oScope.salesOrders && oScope.salesOrders[sSalesOrder]) {
                return true;
            }
            if (sDelivery && oScope.deliveries && oScope.deliveries[sDelivery]) {
                return true;
            }

            return false;
        },

        _matchesActiveUploadWindow: function (oRecord) {
            var sStart = String(this._activeUploadStartedAt || "").trim();
            if (!sStart) {
                return true;
            }

            var rec = oRecord || {};
            var sUpdated = String(rec.updatedAt || rec.createdAt || "").trim();
            if (!sUpdated) {
                return true;
            }

            var iStartMs = Date.parse(sStart);
            var iUpdatedMs = Date.parse(sUpdated);

            if (!Number.isFinite(iStartMs) || !Number.isFinite(iUpdatedMs)) {
                return sUpdated >= sStart;
            }

            // Allow slight clock/processing drift between browser and backend timestamps.
            return iUpdatedMs >= (iStartMs - 2 * 60 * 1000);
        },

        _docStatusFromStatusCode: function (sStatusCode) {
            var sCode = String(sStatusCode || "").toUpperCase();
            if (sCode === "SUCCESS") {
                return "Success";
            }
            if (sCode === "ERROR" || sCode === "FAILED") {
                return "Error";
            }
            if (sCode === "PENDING" || sCode === "RUNNING") {
                return "Pending";
            }
            return "Warning";
        },

        _restoreTrackedResultsFromDB: function () {
            var that = this;
            var oModel = this.getView().getModel("status");

            if (!this._hasActiveResultScope()) {
                return;
            }

            if (this._isRestoringResults) {
                return;
            }
            this._isRestoringResults = true;

            this._fetchApiJson(this._buildProcurementServiceUrl("ProcessingQuotations?$orderby=updatedAt desc&$top=100"))
                .then(function (data) {
                    var aRecords = (data && data.value) ? data.value : [];
                    aRecords = aRecords.filter(function (rec) {
                        return that._matchesActiveResultScope(rec)
                            && that._matchesActiveUploadWindow(rec);
                    });

                    if (!aRecords.length) {
                        return;
                    }

                    var aRows = [];
                    var iQuotationIndex = 1;

                    aRecords.forEach(function (rec, idx) {
                        var sGroupId = rec.ID || ("RESTORE_" + idx);
                        var sFlowType = that._inferFlowTypeFromRecord(rec);
                        var sDocStatus = that._docStatusFromStatusCode(rec.statusCode);
                        var bHasBilling = !!String(rec.billing || "").trim();
                        var bHasSoOrDelivery = !!String(rec.salesOrder || "").trim() || !!String(rec.delivery || "").trim();
                        // Check if FlowType is NOT Procurement-like (backward compatible)
                        var bIsNotProcurement = sFlowType !== "PROCUREMENT" && sFlowType !== "Make-to-Order" && 
                                                sFlowType !== "MTO" && sFlowType !== "maketoorder";
                        if (sDocStatus === "Success" && !bHasBilling && bHasSoOrDelivery && bIsNotProcurement) {
                            sDocStatus = "Pending";
                        }

                        var sStatusTextResolved = rec.statusText ||
                            (sDocStatus === "Pending"
                                ? ((rec.message && String(rec.message).toLowerCase().indexOf("warehouse") !== -1)
                                    ? "Warehouse is processing picking"
                                    : "Processing")
                                : (sDocStatus === "Success" ? "Completed" : "Failed"));
                        if (sDocStatus === "Error" && /^(error|failed|fail)$/i.test(String(sStatusTextResolved || "").trim())) {
                            sStatusTextResolved = "Failed";
                        }

                        // Only create rows for valid quotations - skip placeholder ROW_N entries
                        var sQuotationNo = rec.quotationNo || rec.salesOrder || rec.batchId;
                        if (!sQuotationNo || !String(sQuotationNo).trim()) {
                            // Skip empty quotations - don't create ROW_1, ROW_2, etc.
                            return;
                        }

                        var aItems = [];
                        var aPrs = [];
                        var aPos = [];

                        try {
                            var oParsedItems = rec.itemsJson ? JSON.parse(rec.itemsJson) : [];
                            if (Array.isArray(oParsedItems)) {
                                aItems = oParsedItems;
                            } else if (oParsedItems && typeof oParsedItems === "object") {
                                aItems = Array.isArray(oParsedItems.items) ? oParsedItems.items : [];
                                aPrs = that._extractObjectArray(oParsedItems, ["prs", "prList", "purchaseRequisitions", "itPrItems", "ItPrItems"]);
                                aPos = that._extractObjectArray(oParsedItems, ["pos", "poList", "purchaseOrders", "itPoItems", "ItPoItems"]);
                            }
                        } catch (e) {
                            aItems = [];
                            aPrs = [];
                            aPos = [];
                        }

                        // Helper to check if FlowType is Procurement-like (backward compatible)
                        var bIsProcurement = sFlowType === "PROCUREMENT" || sFlowType === "Make-to-Order" || 
                                             sFlowType === "MTO" || sFlowType === "maketoorder";
                        
                        if (!aPrs.length && bIsProcurement) {
                            aPrs = aItems.filter(function (oItem) {
                                return !!(oItem && (oItem.preqNo || oItem.prNo || oItem.purchaseRequisition));
                            });
                        }

                        if (!aPos.length && bIsProcurement) {
                            aPos = aItems.filter(function (oItem) {
                                return !!(oItem && (oItem.poNo || oItem.purchaseOrder || oItem.ebeln));
                            });
                        }

                        var iPrCount = Number(rec.prCount || (oParsedItems && oParsedItems.prCount) || aPrs.length || 0) || 0;
                        var iPoCount = Number(rec.poCount || (oParsedItems && oParsedItems.poCount) || aPos.length || 0) || 0;
                        var sPrListText = that._buildProcessDocSummary(aPrs, ["preqNo", "prNo", "purchaseRequisition", "prNumber"], "PR");
                        var sPoListText = that._buildProcessDocSummary(aPos, ["poNo", "purchaseOrder", "ebeln", "poNumber"], "PO");

                        var nTotalQuantity = Number(rec.totalQuantity || 0) || 0;
                        var nItemCount = Number(rec.totalItems || aItems.length || 0) || 0;

                        aRows.push({
                            rowIndex: iQuotationIndex++,
                            material: "Quotation " + sQuotationNo,
                            quantity: nTotalQuantity,
                            docType: "QT • " + (nItemCount || 1) + " item(s)",
                            quotation: sQuotationNo,
                            salesOrder: rec.salesOrder || "",
                            delivery: rec.delivery || "",
                            billing: rec.billing || "",
                            flowType: sFlowType,
                            prCount: iPrCount,
                            poCount: iPoCount,
                            prs: aPrs,
                            pos: aPos,
                            prListText: sPrListText,
                            poListText: sPoListText,
                            batchId: rec.batchId || "",
                            flowStage: rec.currentStage || "Main Dispatcher",
                            docStatus: sDocStatus,
                            docStatusText: sStatusTextResolved,
                            message: rec.message || "",
                            timestamp: rec.updatedAt || rec.createdAt || new Date().toISOString(),
                            quotationNo: sQuotationNo,
                            isQuotationParent: true,
                            isChildItem: false,
                            isExpanded: !!that._quotationExpandState[sGroupId],
                            groupId: sGroupId,
                            itemCount: nItemCount || 1
                        });

                        aItems.forEach(function (oItem) {
                            aRows.push({
                                rowIndex: "",
                                material: oItem.material || "",
                                quantity: Number(oItem.quantity || 0) || 0,
                                docType: String(oItem.itemNo || "Item") + " • Detail",
                                quotation: sQuotationNo,
                                salesOrder: rec.salesOrder || "",
                                delivery: rec.delivery || "",
                                billing: rec.billing || "",
                                flowType: sFlowType,
                                prCount: iPrCount,
                                poCount: iPoCount,
                                prs: aPrs,
                                pos: aPos,
                                prListText: sPrListText,
                                poListText: sPoListText,
                                batchId: rec.batchId || "",
                                flowStage: rec.currentStage || "Main Dispatcher",
                                docStatus: sDocStatus,
                                docStatusText: sStatusTextResolved,
                                message: rec.message || "",
                                timestamp: rec.updatedAt || rec.createdAt || new Date().toISOString(),
                                quotationNo: sQuotationNo,
                                itemNo: oItem.itemNo || "",
                                isQuotationParent: false,
                                isChildItem: true,
                                parentGroupId: sGroupId,
                                unit: oItem.unit || "",
                                plant: oItem.plant || "",
                                storLoc: oItem.storLoc || "",
                                deliveryDate: oItem.deliveryDate || ""
                            });
                        });
                    });

                    var aBusinessRows = aRows.filter(function (oRow) {
                        return !!oRow && !oRow.isQuotationParent;
                    });

                    if (!aBusinessRows.length) {
                        aBusinessRows = aRows;
                    }

                    var nPending = aBusinessRows.filter(function (oRow) { return that._isRowPendingLike(oRow); }).length;
                    var nSuccess = aBusinessRows.filter(function (oRow) { return oRow.docStatus === "Success"; }).length;
                    var nFail = aBusinessRows.filter(function (oRow) { return oRow.docStatus === "Error"; }).length;
                    var nSO = aBusinessRows.filter(function (oRow) { return !!String(oRow.salesOrder || "").trim(); }).length;
                    var nDL = aBusinessRows.filter(function (oRow) { return !!String(oRow.delivery || "").trim(); }).length;
                    var nBL = aBusinessRows.filter(function (oRow) { return !!String(oRow.billing || "").trim(); }).length;

                    that._showResults(aRows, nSuccess, nFail, nPending, nSO, nDL, nBL, { skipPersist: true, isRestored: true });
                })
                .catch(function () {
                    // Keep Upload page functional even if restore fails.
                })
                .finally(function () {
                    that._isRestoringResults = false;
                });
        },

        _loadPendingQuotationCount: function () {
            var that = this;
            var oModel = this.getView().getModel("status");

            if (this._isLoadingPendingCount) {
                return;
            }
            this._isLoadingPendingCount = true;

            this._fetchApiJson(this._buildProcurementServiceUrl("ProcessingQuotations?$count=true&$filter=statusCode eq 'PENDING' or statusCode eq 'RUNNING'"))
                .then(function (data) {
                    var nCount = Number(data && data["@odata.count"]) || 0;
                    oModel.setProperty("/pendingQuotationCount", nCount);
                })
                .catch(function () {
                    // Keep UI non-blocking if monitor API is temporarily unavailable.
                    that.getView().getModel("status").setProperty("/pendingQuotationCount", 0);
                })
                .finally(function () {
                    that._isLoadingPendingCount = false;
                });
        },

        _startResultAutoRefresh: function () {
            var that = this;
            if (this._resultRefreshTimer) {
                return;
            }

            this._resultRefreshTimer = setInterval(function () {
                var oView = that.getView();
                if (!oView || (typeof oView.isDestroyed === "function" && oView.isDestroyed())) {
                    that._stopResultAutoRefresh();
                    return;
                }

                var oModel = oView.getModel("status");
                if (!oModel || !oModel.getProperty("/resultVisible")) {
                    return;
                }

                if (!that._hasActiveResultScope()) {
                    return;
                }

                that._restoreTrackedResultsFromDB();
            }, 30000);
        },

        _stopResultAutoRefresh: function () {
            if (this._resultRefreshTimer) {
                clearInterval(this._resultRefreshTimer);
                this._resultRefreshTimer = null;
            }
        },

        /* ══════════════════════════════════════
           2. FILE ADDED — parse Excel immediately
           ══════════════════════════════════════ */
        onUploadSetAfterItemAdded: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            var oFile = oItem && oItem.getFileObject ? oItem.getFileObject() : null;
            var oModel = this.getView().getModel("status");

            if (!oFile) {
                this._resetState();
                MessageToast.show("Cannot read uploaded file");
                this._clearUploadSetItems();
                return;
            }

            var sLowerName = String(oFile.name || "").toLowerCase();
            var bSupportedFormat =
                sLowerName.endsWith(".xlsx") ||
                sLowerName.endsWith(".xls") ||
                sLowerName.endsWith(".xlsm") ||
                sLowerName.endsWith(".csv");
            var bSizeOk = oFile.size <= 10 * 1024 * 1024;
            var bNotEmpty = Number(oFile.size || 0) > 0;

            if (!bSupportedFormat || !bSizeOk || !bNotEmpty) {
                this._storedFile = null;
                this._parsedExcelRows = null;
                this._parsedExcelOrders = null;

                oModel.setProperty("/tableVisible", false);
                oModel.setProperty("/tableData", []);
                oModel.setProperty("/canExecute", false);

                oModel.setProperty("/step1Done", false);
                oModel.setProperty("/step1Active", true);
                oModel.setProperty("/step2Done", false);
                oModel.setProperty("/step2Active", false);
                oModel.setProperty("/step3Active", false);

                oModel.setProperty("/reqFormatIcon", bSupportedFormat ? "sap-icon://accept" : "sap-icon://decline");
                oModel.setProperty("/reqFormatColor", bSupportedFormat ? "#107e3e" : "#b00");

                oModel.setProperty("/reqSizeIcon", bSizeOk ? "sap-icon://accept" : "sap-icon://decline");
                oModel.setProperty("/reqSizeColor", bSizeOk ? "#107e3e" : "#b00");

                oModel.setProperty("/reqStructureIcon", "sap-icon://decline");
                oModel.setProperty("/reqStructureColor", "#b00");

                this._clearUploadSetItems();

                if (!bSupportedFormat) {
                    MessageToast.show("Only Excel (.xlsx/.xls/.xlsm) or CSV (.csv) files are accepted");
                } else if (!bNotEmpty) {
                    MessageToast.show("CSV/Excel file is empty");
                } else {
                    MessageToast.show("File exceeds 10MB limit");
                }
                return;
            }

            this._storedFile = oFile;

            // Step 1 done
            oModel.setProperty("/step1Done", true);
            oModel.setProperty("/step1Active", false);
            oModel.setProperty("/step2Active", true);

            // Validate format
            oModel.setProperty("/reqFormatIcon", "sap-icon://accept");
            oModel.setProperty("/reqFormatColor", "#107e3e");

            // Validate size
            oModel.setProperty("/reqSizeIcon", "sap-icon://accept");
            oModel.setProperty("/reqSizeColor", "#107e3e");

            this._parseExcelFile(oFile);

            this._clearUploadSetItems();

            if (oItem.setUploadState) {
                oItem.setUploadState("Complete");
            }
        },

        _clearUploadSetItems: function () {
            var oUploadSet = this.byId("idUploadSet");
            if (!oUploadSet) {
                return;
            }

            this._skipUploadSetRemoveReset = true;
            oUploadSet.removeAllItems();

            setTimeout(function () {
                this._skipUploadSetRemoveReset = false;
            }.bind(this), 0);
        },

        _normalizeFlatCSVKey: function (vKey) {
            return String(vKey || "")
                .trim()
                .toUpperCase()
                .replace(/[\s_]+/g, "")
                .replace(/[^A-Z0-9]/g, "");
        },

        _getFlatCSVValue: function (oRow, aAliases) {
            var mNormalized = {};
            Object.keys(oRow || {}).forEach(function (sRawKey) {
                var sNormalizedKey = this._normalizeFlatCSVKey(sRawKey);
                if (sNormalizedKey && mNormalized[sNormalizedKey] === undefined) {
                    mNormalized[sNormalizedKey] = oRow[sRawKey];
                }
            }.bind(this));

            var aKeys = Array.isArray(aAliases) ? aAliases : [];
            for (var i = 0; i < aKeys.length; i++) {
                var sCandidateKey = this._normalizeFlatCSVKey(aKeys[i]);
                if (!sCandidateKey) {
                    continue;
                }
                var vCandidate = mNormalized[sCandidateKey];
                if (vCandidate !== undefined && vCandidate !== null && String(vCandidate).trim() !== "") {
                    return String(vCandidate).trim();
                }
            }

            return "";
        },

        _toTrimmedString: function (v) {
            return String(v == null ? "" : v).trim();
        },

        _getFirstJSONValue: function (oSource, aKeys) {
            var o = oSource || {};
            var aList = Array.isArray(aKeys) ? aKeys : [];

            for (var i = 0; i < aList.length; i++) {
                var sKey = aList[i];
                var sValue = this._toTrimmedString(o[sKey]);
                if (sValue) {
                    return sValue;
                }
            }

            return "";
        },

        _isValidCustomerCode: function (v) {
            return /^\d{1,10}$/.test(this._toTrimmedString(v));
        },

        _isDateWithinCurrentMonthFromToday: function (oDate) {
            if (!oDate) {
                return false;
            }

            var oCheck = new Date(oDate);
            oCheck.setHours(0, 0, 0, 0);
            var oToday = this._parseFlexibleDate(this._todayISODate()) || new Date();
            oToday.setHours(0, 0, 0, 0);
            var oMonthEnd = new Date(oToday.getFullYear(), oToday.getMonth() + 1, 0);
            oMonthEnd.setHours(0, 0, 0, 0);

            return oCheck >= oToday
                && oCheck <= oMonthEnd
                && oCheck.getFullYear() === oToday.getFullYear()
                && oCheck.getMonth() === oToday.getMonth();
        },

        /**
         * Validate partner code (SOLD_TO, SHIP_TO, PAYER, BILL_TO)
         * Returns the trimmed value. Validation messages are handled per cell.
         */
        _validatePartnerCode: function (v) {
            return this._toTrimmedString(v);
        },

        /**
         * Validate delivery date
         * Returns null if not a valid date format (e.g., text like "ngày 30 tháng 4")
         * Returns the value if it can be parsed as a valid date
         */
        _validateDeliveryDate: function (v) {
            var sValue = this._toTrimmedString(v);
            if (!sValue) {
                return "";
            }
            // Try to parse as date
            var oDate = this._parseFlexibleDate(sValue);
            if (!oDate) {
                // Invalid date format - reject
                return "";
            }
            return sValue;
        },

        _markCSVDefaultFieldErrors: function () {
            var oModel = this.getView().getModel("status");
            var mDefaultFields = [
                { modelPath: "/jsonDefaultSalesOrg", errorPath: "/csvDefaultSalesOrgError", messagePath: "/csvDefaultSalesOrgErrorText", label: "Sales Organization" },
                { modelPath: "/jsonDefaultDistrChan", errorPath: "/csvDefaultDistrChanError", messagePath: "/csvDefaultDistrChanErrorText", label: "Distribution Channel" },
                { modelPath: "/jsonDefaultDivision", errorPath: "/csvDefaultDivisionError", messagePath: "/csvDefaultDivisionErrorText", label: "Division" },
                { modelPath: "/jsonDefaultDocType", errorPath: "/csvDefaultDocTypeError", messagePath: "/csvDefaultDocTypeErrorText", label: "Doc Type" },
                { modelPath: "/jsonDefaultPlant", errorPath: "/csvDefaultPlantError", messagePath: "/csvDefaultPlantErrorText", label: "Plant" },
                { modelPath: "/jsonDefaultStorLoc", errorPath: "/csvDefaultStorLocError", messagePath: "/csvDefaultStorLocErrorText", label: "Storage Location" }
            ];

            var bValid = true;
            mDefaultFields.forEach(function (oField) {
                var bMissing = !this._toTrimmedString(oModel.getProperty(oField.modelPath));
                oModel.setProperty(oField.errorPath, bMissing);
                oModel.setProperty(oField.messagePath, bMissing ? (oField.label + " is required.") : "");
                if (bMissing) {
                    bValid = false;
                }
            }.bind(this));

            // Validate date fields
            var sValidFrom = this._toTrimmedString(oModel.getProperty("/jsonDefaultValidFrom"));
            var sValidTo = this._toTrimmedString(oModel.getProperty("/jsonDefaultValidTo"));
            var sPriceDate = this._toTrimmedString(oModel.getProperty("/jsonDefaultPriceDate"));

            var bValidFromMissing = !sValidFrom;
            var bValidToMissing = !sValidTo;
            var bPriceDateMissing = !sPriceDate;

            // Price Date must stay in the current month and cannot be before today.
            var bPriceDatePastError = false;
            if (sPriceDate) {
                var dPriceDate = this._parseFlexibleDate(sPriceDate);
                if (!dPriceDate || !this._isDateWithinCurrentMonthFromToday(dPriceDate)) {
                    bPriceDatePastError = true;
                    bValid = false;
                }
            }

            oModel.setProperty("/csvDefaultValidFromError", bValidFromMissing);
            oModel.setProperty("/csvDefaultValidToError", bValidToMissing);
            oModel.setProperty("/csvDefaultPriceDateError", bPriceDateMissing || bPriceDatePastError);
            oModel.setProperty("/csvDefaultPriceDatePastError", bPriceDatePastError);
            oModel.setProperty("/csvDefaultValidFromErrorText", bValidFromMissing ? "Valid From is required." : "");
            oModel.setProperty("/csvDefaultValidToErrorText", bValidToMissing ? "Valid To is required." : "");
            oModel.setProperty("/csvDefaultPriceDateErrorText", bPriceDateMissing ? "Price Date is required." : "");

            if (bValidFromMissing || bValidToMissing || bPriceDateMissing || bPriceDatePastError) {
                bValid = false;
            }

            // Check date range: VALID_FROM must be <= VALID_TO
            var bDateRangeError = false;
            if (sValidFrom && sValidTo) {
                var dValidFrom = this._parseFlexibleDate(sValidFrom);
                var dValidTo = this._parseFlexibleDate(sValidTo);
                if (!dValidFrom || !dValidTo || dValidFrom >= dValidTo) {
                    bDateRangeError = true;
                    bValid = false;
                }
            }
            oModel.setProperty("/csvDefaultDateRangeError", bDateRangeError);
            if (bDateRangeError) {
                oModel.setProperty("/csvDefaultValidFromErrorText", "Valid From must be before Valid To.");
                oModel.setProperty("/csvDefaultValidToErrorText", "Valid To must be after Valid From.");
            }
            if (bPriceDatePastError) {
                oModel.setProperty("/csvDefaultPriceDateErrorText", "Price Date must be between today and the end of the current month.");
            }

            return bValid;
        },

        _computeCSVDefaultValues: function (oRow, mDefaults) {
            var m = mDefaults || this._getCSVDefaults();
            var sSoldTo = this._toTrimmedString(oRow.SOLD_TO) || m.SOLD_TO;

            // Partner fields are locked in the preview and always mirror Sold-to-Party.
            if (sSoldTo) {
                oRow.SHIP_TO = sSoldTo;
                oRow.PAYER = sSoldTo;
                oRow.BILL_TO = sSoldTo;
            }

            // Auto-fill all default fields if missing
            if (!this._toTrimmedString(oRow.SALES_ORG) && m.SALES_ORG) {
                oRow.SALES_ORG = m.SALES_ORG;
            }
            if (!this._toTrimmedString(oRow.DISTR_CHAN) && m.DISTR_CHAN) {
                oRow.DISTR_CHAN = m.DISTR_CHAN;
            }
            if (!this._toTrimmedString(oRow.DIVISION) && m.DIVISION) {
                oRow.DIVISION = m.DIVISION;
            }
            if (!this._toTrimmedString(oRow.DOC_TYPE) && m.DOC_TYPE) {
                oRow.DOC_TYPE = m.DOC_TYPE;
            }
            if (!this._toTrimmedString(oRow.PLANT) && m.PLANT) {
                oRow.PLANT = m.PLANT;
            }
            if (!this._toTrimmedString(oRow.STOR_LOC) && m.STOR_LOC) {
                oRow.STOR_LOC = m.STOR_LOC;
            }

            // Compute date fields if empty (flexible parsing)
            var today = new Date();
            var todayStr = this._formatISODate(today);

            // Parse VALID_FROM with flexible format
            var sValidFrom = this._toTrimmedString(oRow.VALID_FROM);
            if (!sValidFrom) {
                if (m.VALID_FROM) {
                    oRow.VALID_FROM = m.VALID_FROM;
                } else {
                    oRow.VALID_FROM = todayStr;
                }
            } else {
                var oParsedValidFrom = this._parseFlexibleDate(sValidFrom);
                if (oParsedValidFrom) {
                    oRow.VALID_FROM = this._formatISODate(oParsedValidFrom);
                }
            }

            // Parse VALID_TO with flexible format
            var sValidTo = this._toTrimmedString(oRow.VALID_TO);
            if (!sValidTo) {
                if (m.VALID_TO) {
                    oRow.VALID_TO = m.VALID_TO;
                } else {
                    // VALID_TO = today + 4 months
                    var next4Months = new Date(today);
                    next4Months.setMonth(next4Months.getMonth() + 4);
                    oRow.VALID_TO = this._formatISODate(next4Months);
                }
            } else {
                var oParsedValidTo = this._parseFlexibleDate(sValidTo);
                if (oParsedValidTo) {
                    oRow.VALID_TO = this._formatISODate(oParsedValidTo);
                }
            }

            // Parse PRICE_DATE with flexible format
            var sPriceDate = this._toTrimmedString(oRow.PRICE_DATE);
            if (!sPriceDate) {
                if (m.PRICE_DATE) {
                    oRow.PRICE_DATE = m.PRICE_DATE;
                } else {
                    oRow.PRICE_DATE = todayStr;
                }
            } else {
                var oParsedPriceDate = this._parseFlexibleDate(sPriceDate);
                if (oParsedPriceDate) {
                    oRow.PRICE_DATE = this._formatISODate(oParsedPriceDate);
                }
            }

            // Auto-generate QT_REQ_ID if still missing
            if (!this._toTrimmedString(oRow.QT_REQ_ID)) {
                oRow.QT_REQ_ID = "REQ" + String(oRow.RowNo || 1).padStart(3, "0");
            }

            return oRow;
        },

        _formatISODate: function (oDate) {
            return DateUtils.formatISODate(oDate);
        },

        _parseFlexibleDate: function (sDateInput) {
            return DateUtils.parseDate(sDateInput);
        },

        _getCSVDefaults: function () {
            var oModel = this.getView().getModel("status");
            return {
                SALES_ORG: this._toTrimmedString(oModel.getProperty("/jsonDefaultSalesOrg")),
                DISTR_CHAN: this._toTrimmedString(oModel.getProperty("/jsonDefaultDistrChan")),
                DIVISION: this._toTrimmedString(oModel.getProperty("/jsonDefaultDivision")),
                DOC_TYPE: this._toTrimmedString(oModel.getProperty("/jsonDefaultDocType")),
                PLANT: this._toTrimmedString(oModel.getProperty("/jsonDefaultPlant")),
                STOR_LOC: this._toTrimmedString(oModel.getProperty("/jsonDefaultStorLoc")),
                VALID_FROM: this._toTrimmedString(oModel.getProperty("/jsonDefaultValidFrom")),
                VALID_TO: this._toTrimmedString(oModel.getProperty("/jsonDefaultValidTo")),
                PRICE_DATE: this._toTrimmedString(oModel.getProperty("/jsonDefaultPriceDate"))
            };
        },

        _collectCSVRowErrors: function (oRow) {
            var aErrors = [];
            var iRow = Number(oRow.RowNo || 0) || 0;
            var sPrefix = "Row #" + iRow + " ";
            var fnMissing = function (sField) {
                return !this._toTrimmedString(oRow[sField]);
            }.bind(this);

            var sSoldTo = this._toTrimmedString(oRow.SOLD_TO);
            if (!sSoldTo) {
                aErrors.push({ field: "SOLD_TO", message: sPrefix + "Sold-to-Party is required." });
            } else if (!this._isValidCustomerCode(sSoldTo)) {
                aErrors.push({ field: "SOLD_TO", message: sPrefix + "Sold-to-Party must contain only digits and must not exceed 10 digits." });
            }
            
            var sShipTo = this._toTrimmedString(oRow.SHIP_TO);
            if (!sShipTo) {
                aErrors.push({ field: "SHIP_TO", message: sPrefix + "Ship-to-Party is required and is copied from Sold-to-Party." });
            } else if (!this._isValidCustomerCode(sShipTo)) {
                aErrors.push({ field: "SHIP_TO", message: sPrefix + "Ship-to-Party must contain only digits and must not exceed 10 digits." });
            }
            
            var sPayer = this._toTrimmedString(oRow.PAYER);
            if (!sPayer) {
                aErrors.push({ field: "PAYER", message: sPrefix + "Payer is required and is copied from Sold-to-Party." });
            } else if (!this._isValidCustomerCode(sPayer)) {
                aErrors.push({ field: "PAYER", message: sPrefix + "Payer must contain only digits and must not exceed 10 digits." });
            }
            
            var sBillTo = this._toTrimmedString(oRow.BILL_TO);
            if (!sBillTo) {
                aErrors.push({ field: "BILL_TO", message: sPrefix + "Bill-to-Party is required and is copied from Sold-to-Party." });
            } else if (!this._isValidCustomerCode(sBillTo)) {
                aErrors.push({ field: "BILL_TO", message: sPrefix + "Bill-to-Party must contain only digits and must not exceed 10 digits." });
            }
            
            // Note: ITEM_NO is optional - CPI will auto-generate
            if (fnMissing("MATERIAL")) {
                aErrors.push({ field: "MATERIAL", message: sPrefix + "Material is required." });
            } else {
                // Validate Material-ProcessType compatibility
                var sMaterial = this._toTrimmedString(oRow.MATERIAL);
                var sFlowType = this._toTrimmedString(oRow.FlowType || oRow.FLOW_TYPE);
                var oValidation = this._validateMaterialProcessType(sMaterial, sFlowType);
                if (!oValidation.valid) {
                    aErrors.push({ field: "MATERIAL", message: sPrefix + oValidation.message });
                }
            }
            if (fnMissing("DOC_TYPE")) {
                aErrors.push({ field: "DOC_TYPE", message: sPrefix + "Doc Type is required." });
            }
            if (fnMissing("SALES_ORG")) {
                aErrors.push({ field: "SALES_ORG", message: sPrefix + "Sales Organization is required." });
            }
            if (fnMissing("DISTR_CHAN")) {
                aErrors.push({ field: "DISTR_CHAN", message: sPrefix + "Distribution Channel is required." });
            }
            if (fnMissing("DIVISION")) {
                aErrors.push({ field: "DIVISION", message: sPrefix + "Division is required." });
            }
            // VALID_FROM, VALID_TO are now optional - no mandatory checks needed
            if (fnMissing("PLANT")) {
                aErrors.push({ field: "PLANT", message: sPrefix + "Plant is required." });
            }
            if (fnMissing("STOR_LOC")) {
                aErrors.push({ field: "STOR_LOC", message: sPrefix + "Storage Location is required." });
            }

            var nQty = Number(String(oRow.QUANTITY || "").replace(/,/g, ""));
            if (!Number.isFinite(nQty) || nQty <= 0) {
                aErrors.push({ field: "QUANTITY", message: sPrefix + "Quantity must be a number greater than 0." });
            }

            var sFlow = this._normalizeFlowType(oRow.FlowType);
            if (!sFlow) {
                aErrors.push({ field: "FlowType", message: sPrefix + "Process Type is required and must be Order-to-Cash/O2C or Make-to-Order/MTO." });
            }

            var oValidFrom = this._parseFlexibleDate(oRow.VALID_FROM);
            if (this._toTrimmedString(oRow.VALID_FROM) && !oValidFrom) {
                aErrors.push({ field: "VALID_FROM", message: sPrefix + "Valid From is invalid. Use dd/MM/yyyy or yyyy-MM-dd." });
            }

            var oValidTo = this._parseFlexibleDate(oRow.VALID_TO);
            if (this._toTrimmedString(oRow.VALID_TO) && !oValidTo) {
                aErrors.push({ field: "VALID_TO", message: sPrefix + "Valid To is invalid. Use dd/MM/yyyy or yyyy-MM-dd." });
            }

            // Validate PRICE_DATE - check if missing first, then check format
            var sPriceDate = this._toTrimmedString(oRow.PRICE_DATE);
            if (!sPriceDate) {
                aErrors.push({ field: "PRICE_DATE", message: sPrefix + "Price Date is required." });
            } else {
                var oPriceDate = this._parseFlexibleDate(sPriceDate);
                if (!oPriceDate) {
                    aErrors.push({ field: "PRICE_DATE", message: sPrefix + "Price Date is invalid. Use dd/MM/yyyy or yyyy-MM-dd." });
                } else if (!this._isDateWithinCurrentMonthFromToday(oPriceDate)) {
                    aErrors.push({ field: "PRICE_DATE", message: sPrefix + "Price Date must be between today and the end of the current month." });
                }
            }

            if (oValidFrom && oValidTo && oValidTo.getTime() <= oValidFrom.getTime()) {
                aErrors.push({ field: "VALID_TO", message: sPrefix + "Valid To must be after Valid From." });
            }

            // Validate DELIVERY_DATE format
            var sDeliveryDate = this._toTrimmedString(oRow.DELIVERY_DATE);
            if (sDeliveryDate) {
                var oDeliveryDate = this._parseFlexibleDate(sDeliveryDate);
                if (!oDeliveryDate) {
                    aErrors.push({ field: "DELIVERY_DATE", message: sPrefix + "Delivery Date is invalid. Use dd/MM/yyyy or yyyy-MM-dd." });
                } else {
                    var oLeadValidation = this._validateDeliveryDateLeadTime(oDeliveryDate, sFlow);
                    if (!oLeadValidation.valid) {
                        aErrors.push({ field: "DELIVERY_DATE", message: sPrefix + oLeadValidation.message });
                    }
                }
            }

            return aErrors;
        },

        _collectCSVValidationErrors: function (aRows) {
            var aList = Array.isArray(aRows) ? aRows : [];
            if (!aList.length) {
                return [{ row: 0, field: "", message: "CSV/Excel file has no valid data" }];
            }

            var aErrors = [];
            aList.forEach(function (oRow) {
                var aRowErrors = this._collectCSVRowErrors(oRow);
                aRowErrors.forEach(function (oErr) {
                    aErrors.push({
                        row: Number(oRow.RowNo || 0) || 0,
                        field: oErr.field,
                        message: oErr.message
                    });
                });
            }.bind(this));

            return aErrors;
        },

        _applyCSVRowErrorFlags: function (aRows) {
            var aList = Array.isArray(aRows) ? aRows : [];
            var aFieldKeys = [
                "SOLD_TO", "SHIP_TO", "PAYER", "BILL_TO", "MATERIAL", "DOC_TYPE", "SALES_ORG",
                "DISTR_CHAN", "DIVISION", "VALID_FROM", "VALID_TO", "PLANT",
                "STOR_LOC", "QUANTITY", "FlowType", "PRICE_DATE", "DELIVERY_DATE"
            ];

            var iTotalErrors = 0;
            var iInvalidRows = 0;

            aList.forEach(function (oRow) {
                aFieldKeys.forEach(function (sKey) {
                    oRow["_err_" + sKey] = false;
                    oRow["_errMsg_" + sKey] = "";
                });

                var aErrors = this._collectCSVRowErrors(oRow);
                if (aErrors.length) {
                    iInvalidRows++;
                }

                aErrors.forEach(function (oErr) {
                    iTotalErrors++;
                    if (oErr.field) {
                        oRow["_err_" + oErr.field] = true;
                        if (!oRow["_errMsg_" + oErr.field]) {
                            oRow["_errMsg_" + oErr.field] = oErr.message;
                        }
                    }
                });

                oRow._csvErrorCount = aErrors.length;
                oRow._csvErrorMessage = aErrors.length ? aErrors[0].message : "";
            }.bind(this));

            return {
                totalErrors: iTotalErrors,
                invalidRows: iInvalidRows
            };
        },

        _clearCSVDefaultFieldErrors: function () {
            var oModel = this.getView().getModel("status");
            oModel.setProperty("/csvDefaultSalesOrgError", false);
            oModel.setProperty("/csvDefaultDistrChanError", false);
            oModel.setProperty("/csvDefaultDivisionError", false);
            oModel.setProperty("/csvDefaultDocTypeError", false);
            oModel.setProperty("/csvDefaultPlantError", false);
            oModel.setProperty("/csvDefaultStorLocError", false);
            oModel.setProperty("/csvDefaultValidFromError", false);
            oModel.setProperty("/csvDefaultValidToError", false);
            oModel.setProperty("/csvDefaultPriceDateError", false);
            oModel.setProperty("/csvDefaultPriceDatePastError", false);
            oModel.setProperty("/csvDefaultDateRangeError", false);
            [
                "/csvDefaultSalesOrgErrorText",
                "/csvDefaultDistrChanErrorText",
                "/csvDefaultDivisionErrorText",
                "/csvDefaultDocTypeErrorText",
                "/csvDefaultPlantErrorText",
                "/csvDefaultStorLocErrorText",
                "/csvDefaultValidFromErrorText",
                "/csvDefaultValidToErrorText",
                "/csvDefaultPriceDateErrorText"
            ].forEach(function (sPath) {
                oModel.setProperty(sPath, "");
            });
        },

        _refreshCSVPreviewValidation: function () {
            var oModel = this.getView().getModel("status");
            var aRows = oModel.getProperty("/tableData") || [];

            if (!Array.isArray(aRows) || !aRows.length) {
                this._parsedExcelRows = null;
                this._parsedExcelOrders = null;
                oModel.setProperty("/canExecute", false);
                oModel.setProperty("/csvValidationType", "None");
                oModel.setProperty("/csvValidationText", "");
                return;
            }

            // Always show preview with error highlighting - allow editing even with errors
            var oRowSummary = this._applyCSVRowErrorFlags(aRows);
            oModel.setProperty("/tableData", aRows);

            var bRowsValid = oRowSummary.totalErrors === 0;
            var bOrderValid = false;
            var aOrders = [];
            var sOrderError = "";

            // Try to build orders even with some errors (will use defaults)
            if (bRowsValid) {
                try {
                    aOrders = this._buildDispatcherOrdersFromCSVRows(aRows);
                    if (aOrders.length) {
                        for (var i = 0; i < aOrders.length; i++) {
                            this._validateJSONOrder(aOrders[i], i);
                        }
                        bOrderValid = true;
                    }
                } catch (err) {
                    sOrderError = err && err.message ? err.message : "Data is invalid";
                }
            }

            // Can execute when rows are valid and orders can be built
            var bCanExecute = bRowsValid && bOrderValid && aOrders.length > 0;
            oModel.setProperty("/canExecute", bCanExecute);

            // Store parsed data for editing purposes even if not valid yet
            this._parsedExcelRows = aRows;
            if (bCanExecute) {
                this._parsedExcelOrders = aOrders;
            } else {
                this._parsedExcelOrders = null;
            }

            if (bCanExecute) {
                oModel.setProperty("/reqStructureIcon", "sap-icon://accept");
                oModel.setProperty("/reqStructureColor", "#107e3e");
                oModel.setProperty("/step2Done", true);
                oModel.setProperty("/step2Active", false);
                oModel.setProperty("/step3Active", true);
                oModel.setProperty("/csvValidationType", "Success");
                oModel.setProperty("/csvValidationText", "✅ Data is valid. Ready to send " + aOrders.length + " order(s)");
                return;
            }

            // Show preview with warnings - allow user to edit
            oModel.setProperty("/reqStructureIcon", bRowsValid ? "sap-icon://accept" : "sap-icon://warning");
            oModel.setProperty("/reqStructureColor", bRowsValid ? "#107e3e" : "#e9730c");
            oModel.setProperty("/step2Done", false);
            oModel.setProperty("/step2Active", true);
            oModel.setProperty("/step3Active", false);

            var aProblems = [];
            if (!bRowsValid) {
                var aDetailedErrors = this._collectCSVValidationErrors(aRows)
                    .map(function (oErr) { return oErr.message; })
                    .filter(function (sMsg, iIndex, aAll) { return sMsg && aAll.indexOf(sMsg) === iIndex; })
                    .slice(0, 4);
                aProblems = aProblems.concat(aDetailedErrors);
                if (oRowSummary.totalErrors > aDetailedErrors.length) {
                    aProblems.push((oRowSummary.totalErrors - aDetailedErrors.length) + " more validation issue(s). Review the highlighted cells.");
                }
            }
            if (bRowsValid && !bOrderValid && sOrderError) {
                aProblems.push(sOrderError);
            }

            // Show as Warning to indicate editable state
            oModel.setProperty("/csvValidationType", bRowsValid ? "Warning" : "Error");
            oModel.setProperty("/csvValidationText", (bRowsValid ? "⚠️ " : "❌ ") + (aProblems.join("; ") || "Please check your data"));
        },

        onValidateDefaultFields: function () {
            var oModel = this.getView().getModel("status");
            var bValid = this._validateCSVDefaultFieldsRealTime();
            
            if (bValid) {
                MessageToast.show("All default information is valid");
            } else {
                var aMessages = [
                    "/csvDefaultSalesOrgErrorText",
                    "/csvDefaultDistrChanErrorText",
                    "/csvDefaultDivisionErrorText",
                    "/csvDefaultDocTypeErrorText",
                    "/csvDefaultPlantErrorText",
                    "/csvDefaultStorLocErrorText",
                    "/csvDefaultValidFromErrorText",
                    "/csvDefaultValidToErrorText",
                    "/csvDefaultPriceDateErrorText"
                ].map(function (sPath) {
                    return String(oModel.getProperty(sPath) || "").trim();
                }).filter(Boolean);
                MessageToast.show("Validation failed: " + (aMessages[0] || "Please fill in all required fields."));
            }
            
            // Also refresh preview to update any dependent validation
            this._refreshCSVPreviewValidation();
        },

        _validateCSVDefaultFieldsRealTime: function () {
            var oModel = this.getView().getModel("status");
            var bAllValid = true;

            // Helper to check if value is empty
            var isEmpty = function (v) {
                return !v || String(v).trim() === "";
            };

            // Validate all text fields - empty = error
            var aTextFields = [
                { path: "/jsonDefaultSalesOrg", errorPath: "/csvDefaultSalesOrgError", messagePath: "/csvDefaultSalesOrgErrorText", label: "Sales Organization" },
                { path: "/jsonDefaultDistrChan", errorPath: "/csvDefaultDistrChanError", messagePath: "/csvDefaultDistrChanErrorText", label: "Distribution Channel" },
                { path: "/jsonDefaultDivision", errorPath: "/csvDefaultDivisionError", messagePath: "/csvDefaultDivisionErrorText", label: "Division" },
                { path: "/jsonDefaultDocType", errorPath: "/csvDefaultDocTypeError", messagePath: "/csvDefaultDocTypeErrorText", label: "Doc Type" },
                { path: "/jsonDefaultPlant", errorPath: "/csvDefaultPlantError", messagePath: "/csvDefaultPlantErrorText", label: "Plant" },
                { path: "/jsonDefaultStorLoc", errorPath: "/csvDefaultStorLocError", messagePath: "/csvDefaultStorLocErrorText", label: "Storage Location" }
            ];

            aTextFields.forEach(function (field) {
                var value = oModel.getProperty(field.path);
                var hasError = isEmpty(value);
                oModel.setProperty(field.errorPath, hasError);
                oModel.setProperty(field.messagePath, hasError ? (field.label + " is required.") : "");
                if (hasError) {
                    bAllValid = false;
                }
            });

            // Validate date fields
            var sValidFrom = oModel.getProperty("/jsonDefaultValidFrom");
            var sValidTo = oModel.getProperty("/jsonDefaultValidTo");
            var sPriceDate = oModel.getProperty("/jsonDefaultPriceDate");

            var bValidFromError = isEmpty(sValidFrom);
            var bValidToError = isEmpty(sValidTo);
            var bPriceDateError = isEmpty(sPriceDate);

            oModel.setProperty("/csvDefaultValidFromError", bValidFromError);
            oModel.setProperty("/csvDefaultValidToError", bValidToError);
            oModel.setProperty("/csvDefaultPriceDateError", bPriceDateError);
            oModel.setProperty("/csvDefaultValidFromErrorText", bValidFromError ? "Valid From is required." : "");
            oModel.setProperty("/csvDefaultValidToErrorText", bValidToError ? "Valid To is required." : "");
            oModel.setProperty("/csvDefaultPriceDateErrorText", bPriceDateError ? "Price Date is required." : "");

            if (bValidFromError || bValidToError || bPriceDateError) {
                bAllValid = false;
            }

            // Also check date range and current-month Price Date
            if (!bValidFromError && !bValidToError) {
                var validFrom = this._parseFlexibleDate(sValidFrom);
                var validTo = this._parseFlexibleDate(sValidTo);
                if (validFrom && validTo && validFrom >= validTo) {
                    oModel.setProperty("/csvDefaultDateRangeError", true);
                    oModel.setProperty("/csvDefaultValidFromErrorText", "Valid From must be before Valid To.");
                    oModel.setProperty("/csvDefaultValidToErrorText", "Valid To must be after Valid From.");
                    bAllValid = false;
                } else {
                    oModel.setProperty("/csvDefaultDateRangeError", false);
                }
            }

            if (!bPriceDateError) {
                var priceDate = this._parseFlexibleDate(sPriceDate);
                if (!priceDate || !this._isDateWithinCurrentMonthFromToday(priceDate)) {
                    oModel.setProperty("/csvDefaultPriceDatePastError", true);
                    oModel.setProperty("/csvDefaultPriceDateErrorText", "Price Date must be between today and the end of the current month.");
                    bAllValid = false;
                } else {
                    oModel.setProperty("/csvDefaultPriceDatePastError", false);
                    oModel.setProperty("/csvDefaultPriceDateErrorText", "");
                }
            }

            return bAllValid;
        },

        onDefaultFieldChange: function () {
            var oModel = this.getView().getModel("status");
            ["/jsonDefaultValidFrom", "/jsonDefaultValidTo", "/jsonDefaultPriceDate"].forEach(function (sPath) {
                var sValue = String(oModel.getProperty(sPath) || "").trim();
                var sIso = this._formatDateForPayload(sValue);
                if (sIso && sIso !== sValue) {
                    oModel.setProperty(sPath, sIso);
                }
            }.bind(this));
            oModel.setProperty("/defaultFieldsPending", true);
            this._validateCSVDefaultFieldsRealTime();
        },

        onApplyDefaultsToTable: function () {
            var oModel = this.getView().getModel("status");

            // Check if default fields have errors - prevent applying if there are errors
            var bDefaultsValid = this._validateCSVDefaultFieldsRealTime();
            if (!bDefaultsValid) {
                var bDateRangeError = oModel.getProperty("/csvDefaultDateRangeError");
                var bPriceDatePastError = oModel.getProperty("/csvDefaultPriceDatePastError");
                if (bPriceDatePastError) {
                    MessageBox.error("PRICE_DATE cannot be in the past");
                } else if (bDateRangeError) {
                    MessageBox.error("VALID_FROM cannot be before VALID_TO");
                } else {
                    MessageBox.error("Please fill in all required default information fields");
                }
                return;
            }

            var aTableData = oModel.getProperty("/tableData") || [];
            var mDefaults = this._getCSVDefaults();

            if (!aTableData.length) {
                MessageToast.show("No data to apply defaults");
                return;
            }

            // Apply defaults to all rows
            var aUpdatedData = aTableData.map(function (oRow, iIndex) {
                // Apply defaults - always overwrite with default values
                if (mDefaults.SALES_ORG) {
                    oRow.SALES_ORG = mDefaults.SALES_ORG;
                }
                if (mDefaults.DISTR_CHAN) {
                    oRow.DISTR_CHAN = mDefaults.DISTR_CHAN;
                }
                if (mDefaults.DIVISION) {
                    oRow.DIVISION = mDefaults.DIVISION;
                }
                if (mDefaults.DOC_TYPE) {
                    oRow.DOC_TYPE = mDefaults.DOC_TYPE;
                }
                if (mDefaults.PLANT) {
                    oRow.PLANT = mDefaults.PLANT;
                }
                if (mDefaults.STOR_LOC) {
                    oRow.STOR_LOC = mDefaults.STOR_LOC;
                }

                // Apply date defaults - always overwrite
                if (mDefaults.VALID_FROM) {
                    oRow.VALID_FROM = mDefaults.VALID_FROM;
                }
                if (mDefaults.VALID_TO) {
                    oRow.VALID_TO = mDefaults.VALID_TO;
                }
                if (mDefaults.PRICE_DATE) {
                    oRow.PRICE_DATE = mDefaults.PRICE_DATE;
                }

                // Apply computed defaults (partners, dates, QT_REQ_ID) - only fill if missing
                this._computeCSVDefaultValues(oRow, mDefaults);

                return oRow;
            }.bind(this));

            oModel.setProperty("/tableData", aUpdatedData);
            oModel.setProperty("/csvPendingChanges", false);
            oModel.setProperty("/defaultFieldsPending", false);
            this._lastRawCSVContent = this._convertRowsToCSV(aUpdatedData);
            this._isCSVFile = true;
            oModel.setProperty("/_lastRawCSVContent", this._lastRawCSVContent);
            oModel.setProperty("/_isCSVFile", true);
            try {
                localStorage.setItem("_lastIsCSVFile", "true");
                localStorage.setItem("_lastRawCSVContent", this._lastRawCSVContent || "");
            } catch (e) {
                // Ignore localStorage errors
            }
            this._refreshCSVPreviewValidation();
            MessageToast.show("Applied default data to " + aUpdatedData.length + " rows");
        },

        onConfirmPreviewData: function () {
            var oModel = this.getView().getModel("status");
            var aTableData = oModel.getProperty("/tableData") || [];

            if (!aTableData.length) {
                MessageToast.show("No preview data to confirm");
                return;
            }

            var mDefaults = this._getCSVDefaults();
            aTableData = aTableData.map(function (oRow) {
                var oNext = Object.assign({}, oRow);
                this._computeCSVDefaultValues(oNext, mDefaults);
                return oNext;
            }.bind(this));
            oModel.setProperty("/tableData", aTableData);
            this._refreshCSVPreviewValidation();

            if (!oModel.getProperty("/canExecute")) {
                oModel.setProperty("/csvPendingChanges", true);
                MessageToast.show("Validation failed. Fix the highlighted cells before sending.");
                return;
            }

            this._lastRawCSVContent = this._convertRowsToCSV(aTableData);
            this._isCSVFile = true;
            oModel.setProperty("/_lastRawCSVContent", this._lastRawCSVContent);
            oModel.setProperty("/_isCSVFile", true);
            try {
                localStorage.setItem("_lastIsCSVFile", "true");
                localStorage.setItem("_lastRawCSVContent", this._lastRawCSVContent || "");
            } catch (e) {
                // Ignore localStorage errors
            }

            oModel.setProperty("/csvPendingChanges", false);
            this._refreshCSVPreviewValidation();
            MessageToast.show("Preview data has been validated");
        },

        onCSVPreviewFieldLiveChange: function (oEvent) {
            var oInput = oEvent.getSource();
            var oCtx = oInput.getBindingContext("status");
            if (!oCtx) {
                return;
            }

            var aCustomData = oInput.getCustomData && oInput.getCustomData();
            var sField = "";
            (aCustomData || []).some(function (oData) {
                if (oData.getKey && oData.getKey() === "field") {
                    sField = oData.getValue ? oData.getValue() : "";
                    return true;
                }
                return false;
            });

            if (!sField) {
                return;
            }

            var sPath = oCtx.getPath() + "/" + sField;
            var sValue = oEvent.getParameter("value");
            if (sValue === undefined && oEvent.getParameter("selectedKey") !== undefined) {
                sValue = oEvent.getParameter("selectedKey");
            }
            if (sValue === undefined && oInput.getSelectedKey) {
                sValue = oInput.getSelectedKey();
            }
            var oModel = oCtx.getModel();
            oModel.setProperty(sPath, sValue);
            oModel.setProperty("/csvPendingChanges", true);

            // Locked partner fields mirror Sold-to-Party.
            if (sField === "SOLD_TO" && sValue) {
                var sRowPath = oCtx.getPath();
                oModel.setProperty(sRowPath + "/SHIP_TO", sValue);
                oModel.setProperty(sRowPath + "/PAYER", sValue);
                oModel.setProperty(sRowPath + "/BILL_TO", sValue);
            }

            this._refreshCSVPreviewValidation();
        },

        _normalizeCSVDispatcherRow: function (oRawRow, iIndex, mDefaults) {
            var m = mDefaults || this._getCSVDefaults();

            var oRow = {
                RowNo: iIndex + 1,
                QT_REQ_ID: this._getFlatCSVValue(oRawRow, ["QT_REQ_ID"]) || ("REQ" + String(iIndex + 1).padStart(3, "0")),
                SALES_ORG: this._getFlatCSVValue(oRawRow, ["SALES_ORG", "Sales Organization"]) || m.SALES_ORG,
                DISTR_CHAN: this._getFlatCSVValue(oRawRow, ["DISTR_CHAN", "Distrubution Channel"]) || m.DISTR_CHAN,
                DIVISION: this._getFlatCSVValue(oRawRow, ["DIVISION", "Division"]) || m.DIVISION,
                DOC_TYPE: this._getFlatCSVValue(oRawRow, ["DOC_TYPE", "DOCTYPE", "Doc Type"]) || m.DOC_TYPE,
                SOLD_TO: this._validatePartnerCode(this._getFlatCSVValue(oRawRow, ["SOLD_TO", "SOLDTO", "SOLDTOPARTY", "Sold-to-Party"])),
                SHIP_TO: this._validatePartnerCode(this._getFlatCSVValue(oRawRow, ["SHIP_TO", "SHIPTO", "SHIPTOPARTY", "Ship-to-Party"])),
                PAYER: this._validatePartnerCode(this._getFlatCSVValue(oRawRow, ["PAYER", "Payer"])),
                BILL_TO: this._validatePartnerCode(this._getFlatCSVValue(oRawRow, ["BILL_TO", "BILLTO", "BILLTOPARTY", "Bill-to-Party"])),
                VALID_FROM: this._getFlatCSVValue(oRawRow, ["VALID_FROM", "Valid From"]),
                VALID_TO: this._getFlatCSVValue(oRawRow, ["VALID_TO", "Vaid To"]),
                PRICE_DATE: this._getFlatCSVValue(oRawRow, ["PRICE_DATE", "PRICEDATE", "Price Date"]),
                PURCH_NO_C: this._getFlatCSVValue(oRawRow, ["PURCH_NO_C", "PURCHNOC", "PO", "Purchase Reference"]),
                SALES_DIST: this._getFlatCSVValue(oRawRow, ["SALES_DIST", "SALESDIST"]),
                CUST_GROUP: this._getFlatCSVValue(oRawRow, ["CUST_GROUP", "CUSTGROUP"]),
                RequesterEmail: this._getFlatCSVValue(oRawRow, ["RequesterEmail", "REQUESTEREMAIL", "EMAIL", "Requester Email"]),
                FlowType: this._getFlatCSVValue(oRawRow, ["FlowType", "FLOWTYPE", "PROCESS_TYPE", "Process Type"]),
                ITEM_NO: this._getFlatCSVValue(oRawRow, ["ITEM_NO", "ITEMNO"]),
                MATERIAL: this._getFlatCSVValue(oRawRow, ["MATERIAL", "MATERIALNO", "Material"]),
                QUANTITY: this._getFlatCSVValue(oRawRow, ["QUANTITY", "QTY", "Quantity"]),
                UNIT: this._getFlatCSVValue(oRawRow, ["UNIT", "UOM", "Unit"]) || m.UNIT || "EA",
                PLANT: this._getFlatCSVValue(oRawRow, ["PLANT", "Plant"]) || m.PLANT,
                STOR_LOC: this._getFlatCSVValue(oRawRow, ["STOR_LOC", "STORAGELOC", "Storage Location"]) || m.STOR_LOC,
                DELIVERY_DATE: this._validateDeliveryDate(this._getFlatCSVValue(oRawRow, ["DELIVERY_DATE", "DELIVERYDATE", "Delivery Date"]))
            };

            // Parse and format DELIVERY_DATE to ISO format
            if (oRow.DELIVERY_DATE) {
                var oDeliveryDate = this._parseFlexibleDate(oRow.DELIVERY_DATE);
                if (oDeliveryDate) {
                    oRow.DELIVERY_DATE = this._formatISODate(oDeliveryDate);
                }
            }

            // Parse and format VALID_FROM to ISO format
            if (oRow.VALID_FROM) {
                var oValidFrom = this._parseFlexibleDate(oRow.VALID_FROM);
                if (oValidFrom) {
                    oRow.VALID_FROM = this._formatISODate(oValidFrom);
                }
            }

            // Parse and format VALID_TO to ISO format
            if (oRow.VALID_TO) {
                var oValidTo = this._parseFlexibleDate(oRow.VALID_TO);
                if (oValidTo) {
                    oRow.VALID_TO = this._formatISODate(oValidTo);
                }
            }

            // Parse and format PRICE_DATE to ISO format
            if (oRow.PRICE_DATE) {
                var oPriceDate = this._parseFlexibleDate(oRow.PRICE_DATE);
                if (oPriceDate) {
                    oRow.PRICE_DATE = this._formatISODate(oPriceDate);
                }
            }

            // Apply computed default values (auto-fill partners, dates, etc.)
            this._computeCSVDefaultValues(oRow, m);
            
            // Auto-generate PURCH_NO_C if not provided: max 8 characters
            if (!oRow.PURCH_NO_C) {
                var sSoldTo = (oRow.SOLD_TO || "000").toString().slice(-3);
                var sRandom = Math.random().toString(36).substring(2, 5).toUpperCase();
                oRow.PURCH_NO_C = (sSoldTo + sRandom).substring(0, 8);
            }

            if (!oRow.RequesterEmail) {
                oRow.RequesterEmail = m.RequesterEmail || "";
            }
            oRow.FlowType = this._normalizeFlowType(oRow.FlowType);

            // Auto-fill DELIVERY_DATE if not provided based on FlowType
            if (!oRow.DELIVERY_DATE) {
                oRow.DELIVERY_DATE = this._getDefaultDeliveryDateForProcessType(oRow.FlowType);
            }

            return oRow;
        },

        _validateCSVRows: function (aRows) {
            var aErrors = this._collectCSVValidationErrors(aRows);
            if (aErrors.length) {
                throw new Error(aErrors[0].message);
            }
        },

        _formatDateForPayload: function (vValue) {
            var sValue = String(vValue || "").trim();
            if (!sValue) {
                return "";
            }
            return DateUtils.formatISODate(sValue) || sValue;
        },

        _formatDateForDisplay: function (vValue) {
            var sValue = String(vValue || "").trim();
            if (!sValue) {
                return "";
            }
            return DateUtils.formatDisplayDate(sValue) || sValue;
        },

        _buildDispatcherOrdersFromCSVRows: function (aRows) {
            var aInputRows = Array.isArray(aRows) ? aRows : [];
            var aOrders = [];
            var mByKey = {};

            aInputRows.forEach(function (oRow) {
                var sOrderKey = [
                    oRow.QT_REQ_ID,
                    oRow.SALES_ORG,
                    oRow.DISTR_CHAN,
                    oRow.DIVISION,
                    oRow.DOC_TYPE,
                    oRow.SOLD_TO,
                    oRow.SHIP_TO,
                    oRow.PAYER,
                    oRow.BILL_TO,
                    oRow.PURCH_NO_C,
                    oRow.FlowType
                ].join("|");

                var oOrder = mByKey[sOrderKey];
                if (!oOrder) {
                    oOrder = {
                        QT_REQ_ID: oRow.QT_REQ_ID,
                        SALES_ORG: oRow.SALES_ORG,
                        DISTR_CHAN: oRow.DISTR_CHAN,
                        DIVISION: oRow.DIVISION,
                        DOC_TYPE: oRow.DOC_TYPE,
                        SOLD_TO: oRow.SOLD_TO,
                        SHIP_TO: oRow.SHIP_TO,
                        PAYER: oRow.PAYER,
                        BILL_TO: oRow.BILL_TO,
                        VALID_FROM: this._formatDateForPayload(oRow.VALID_FROM),
                        VALID_TO: this._formatDateForPayload(oRow.VALID_TO),
                        PRICE_DATE: this._formatDateForPayload(oRow.PRICE_DATE),
                        PURCH_NO_C: oRow.PURCH_NO_C,
                        SALES_DIST: oRow.SALES_DIST,
                        CUST_GROUP: oRow.CUST_GROUP,
                        RequesterEmail: oRow.RequesterEmail,
                        FlowType: oRow.FlowType,
                        IT_ITEMS: {
                            item: []
                        }
                    };
                    mByKey[sOrderKey] = oOrder;
                    aOrders.push(oOrder);
                }

                var sItemNo = oRow.ITEM_NO || String((oOrder.IT_ITEMS.item.length + 1) * 10).padStart(6, "0");
                oOrder.IT_ITEMS.item.push({
                    ITEM_NO: sItemNo,
                    MATERIAL: oRow.MATERIAL,
                    QUANTITY: oRow.QUANTITY,
                    UNIT: oRow.UNIT,
                    PLANT: oRow.PLANT,
                    STOR_LOC: oRow.STOR_LOC,
                    DELIVERY_DATE: this._formatDateForPayload(oRow.DELIVERY_DATE)
                });
            }.bind(this));

            return aOrders;
        },

        /* Convert rows array to CSV string format */
        _convertRowsToCSV: function (aRows) {
            if (!Array.isArray(aRows) || aRows.length === 0) {
                return "";
            }
            
            // Define CSV headers matching the row structure
            var aHeaders = [
                "QT_REQ_ID", "SALES_ORG", "DISTR_CHAN", "DIVISION", "DOC_TYPE",
                "SOLD_TO", "SHIP_TO", "PAYER", "BILL_TO", "VALID_FROM", "VALID_TO",
                "PRICE_DATE", "PURCH_NO_C", "SALES_DIST", "CUST_GROUP",
                "RequesterEmail", "FlowType", "ITEM_NO", "MATERIAL",
                "QUANTITY", "UNIT", "PLANT", "STOR_LOC", "DELIVERY_DATE"
            ];
            
            // Build CSV content
            var aLines = [];
            
            // Header row
            aLines.push(aHeaders.join(","));
            
            // Data rows
            aRows.forEach(function (oRow) {
                var aValues = aHeaders.map(function (sHeader) {
                    var sValue = String(oRow[sHeader] || "").trim();
                    if (["VALID_FROM", "VALID_TO", "PRICE_DATE", "DELIVERY_DATE"].indexOf(sHeader) !== -1) {
                        sValue = this._formatDateForPayload(sValue);
                    }
                    // Escape values containing commas or quotes
                    if (sValue.indexOf(",") !== -1 || sValue.indexOf('"') !== -1) {
                        sValue = '"' + sValue.replace(/"/g, '""') + '"';
                    }
                    return sValue;
                }.bind(this));
                aLines.push(aValues.join(","));
            }.bind(this));
            
            return aLines.join("\n");
        },

        /* ══════════════════════════════════════
           2. PARSE CSV/EXCEL → CPI dispatcher rows/orders
           ══════════════════════════════════════ */
        _parseExcelFile: function (oFile) {
            var oModel = this.getView().getModel("status");
            var that = this;

            if (!oFile || Number(oFile.size || 0) <= 0) {
                that._parsedExcelRows = null;
                that._parsedExcelOrders = null;
                oModel.setProperty("/tableVisible", false);
                oModel.setProperty("/tableData", []);
                oModel.setProperty("/canExecute", false);
                oModel.setProperty("/reqStructureIcon", "sap-icon://decline");
                oModel.setProperty("/reqStructureColor", "#b00");
                MessageToast.show("File CSV/Excel rỗng");
                return;
            }

            var sFileName = String(oFile.name || "").toLowerCase();
            that._lastUploadedFileName = oFile.name;
            that._isCSVFile = sFileName.endsWith(".csv");
            
            // Save to model for persistence
            oModel.setProperty("/_isCSVFile", that._isCSVFile);
            oModel.setProperty("/_lastUploadedFileName", that._lastUploadedFileName);

            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var workbook;
                    if (that._isCSVFile) {
                        // CSV: Lưu raw text content
                        that._lastRawCSVContent = String(e.target.result || "");
                        // Lưu vào model để persist
                        oModel.setProperty("/_lastRawCSVContent", that._lastRawCSVContent);
                        // Lưu vào localStorage để không bị mất khi navigate
                        localStorage.setItem("_lastUploadedFileName", oFile.name);
                        localStorage.setItem("_lastIsCSVFile", "true");
                        localStorage.setItem("_lastRawCSVContent", that._lastRawCSVContent);

                        // Parse CSV bằng XLSX để hiển thị trong bảng
                        var data = new Uint8Array(new TextEncoder().encode(e.target.result));
                        // eslint-disable-next-line no-undef
                        workbook = XLSX.read(data, { type: "array" });
                    } else {
                        // Excel: Parse nhưng vẫn sẽ convert thành CSV để gửi
                        var data = new Uint8Array(e.target.result);
                        // eslint-disable-next-line no-undef
                        workbook = XLSX.read(data, { type: "array" });
                    }

                    var sheet = workbook.Sheets[workbook.SheetNames[0]];
                    // eslint-disable-next-line no-undef
                    var rawRows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });

                    // Validate required headers (support both old technical and new user-friendly names)
                    var aRequiredHeaderGroups = [
                        ["SOLD_TO", "Sold-to-Party"],
                        ["MATERIAL", "Material"],
                        ["FlowType", "Process Type", "FLOWTYPE", "PROCESS_TYPE"],
                        ["QUANTITY", "Quantity"],
                        ["UNIT", "Unit"],
                        ["DELIVERY_DATE", "Delivery Date"]
                    ];
                    var aMissingHeaders = [];
                    
                    if (rawRows && rawRows.length > 0) {
                        var oFirstRow = rawRows[0];
                        var aFileHeaders = Object.keys(oFirstRow || {});
                        
                        aRequiredHeaderGroups.forEach(function (aHeaderGroup) {
                            // Check with the same normalized matching used by _getFlatCSVValue.
                            var bFound = aFileHeaders.some(function (sHeader) {
                                var sNormalizedHeader = that._normalizeFlatCSVKey(sHeader);
                                return aHeaderGroup.some(function (sAlt) {
                                    return sNormalizedHeader === that._normalizeFlatCSVKey(sAlt);
                                });
                            });
                            if (!bFound) {
                                aMissingHeaders.push(aHeaderGroup[aHeaderGroup.length - 1]); // Use user-friendly name
                            }
                        });
                    }
                    
                    if (aMissingHeaders.length > 0) {
                        oModel.setProperty("/canExecute", false);
                        oModel.setProperty("/tableVisible", false);
                        oModel.setProperty("/tableData", []);
                        oModel.setProperty("/reqStructureIcon", "sap-icon://decline");
                        oModel.setProperty("/reqStructureColor", "#b00");
                        MessageToast.show("Invalid CSV/Excel file: Missing required columns: " + aMissingHeaders.join(", "));
                        return;
                    }

                    var mDefaults = that._getJSONDefaults();
                    var rows = (rawRows || []).filter(function (oRawRow) {
                        return Object.keys(oRawRow || {}).some(function (sKey) {
                            return String(oRawRow[sKey] || "").trim() !== "";
                        });
                    }).map(function (oRawRow, iIndex) {
                        return that._normalizeCSVDispatcherRow(oRawRow, iIndex, mDefaults);
                    });

                    if (!rows.length) {
                        oModel.setProperty("/canExecute", false);
                        oModel.setProperty("/reqStructureIcon", "sap-icon://decline");
                        oModel.setProperty("/reqStructureColor", "#b00");
                        MessageToast.show("CSV/Excel file is empty or invalid structure");
                        return;
                    }

                    // Convert rows to CSV string for CPI upload (both CSV and Excel)
                    var sCSVContent = that._convertRowsToCSV(rows);
                    that._lastRawCSVContent = sCSVContent;
                    that._isCSVFile = true; // Force CSV format for CPI
                    
                    // Save to model for persistence
                    oModel.setProperty("/_lastRawCSVContent", sCSVContent);
                    oModel.setProperty("/_isCSVFile", true);
                    localStorage.setItem("_lastIsCSVFile", "true");
                    localStorage.setItem("_lastRawCSVContent", sCSVContent);
                    
                    that._parsedExcelRows = rows;
                    that._parsedExcelOrders = null;

                    oModel.setProperty("/tableData", rows);
                    oModel.setProperty("/tableVisible", true);
                    oModel.setProperty("/canExecute", false);
                    oModel.setProperty("/csvPendingChanges", false);
                    oModel.setProperty("/defaultFieldsPending", false);

                    that._refreshCSVPreviewValidation();

                    if (oModel.getProperty("/canExecute")) {
                        MessageToast.show("Detected " + rows.length + " rows. Data is valid and ready to send.");
                    } else {
                        MessageToast.show("Detected " + rows.length + " rows. Please fix red cells before sending.");
                    }

                } catch (err) {
                    that._parsedExcelRows = null;
                    that._parsedExcelOrders = null;
                    oModel.setProperty("/tableVisible", false);
                    oModel.setProperty("/tableData", []);
                    oModel.setProperty("/canExecute", false);
                    oModel.setProperty("/reqStructureIcon", "sap-icon://decline");
                    oModel.setProperty("/reqStructureColor", "#b00");
                    MessageToast.show("CSV/Excel parse error: " + err.message);
                }
            };
            if (that._isCSVFile) {
                reader.readAsText(oFile);
            } else {
                reader.readAsArrayBuffer(oFile);
            }
        },

        /* ══════════════════════════════════════
           3. FILE REMOVED / CLEAR
           ══════════════════════════════════════ */
        onUploadSetAfterItemRemoved: function () {
            if (this._skipUploadSetRemoveReset) {
                return;
            }
            this._resetState();
        },

        onUploadSetFileTypeMismatch: function () {
            this._parsedExcelRows = null;
            this._parsedExcelOrders = null;

            var oModel = this.getView().getModel("status");
            oModel.setProperty("/tableVisible", false);
            oModel.setProperty("/tableData", []);
            oModel.setProperty("/canExecute", false);
            oModel.setProperty("/reqFormatIcon", "sap-icon://decline");
            oModel.setProperty("/reqFormatColor", "#b00");
            oModel.setProperty("/reqStructureIcon", "sap-icon://decline");
            oModel.setProperty("/reqStructureColor", "#b00");

            MessageToast.show("Chỉ chấp nhận file Excel (.xlsx/.xls/.xlsm) hoặc CSV (.csv)");
        },

        onButtonClearPress: function () {
            this._resetState();
        },

        onDeleteColumnPress: function () {
            var oModel = this.getView().getModel("status");
            var aTableData = oModel.getProperty("/tableData") || [];
            
            if (!aTableData.length) {
                MessageToast.show("No data to delete columns");
                return;
            }

            // Calculate error count per column
            var mColumnErrors = {};
            var aColumns = [
                "SALES_ORG", "DISTR_CHAN", "DIVISION", "DOC_TYPE", "SOLD_TO", "SHIP_TO", "PAYER", "BILL_TO",
                "VALID_FROM", "VALID_TO", "PRICE_DATE", "PURCH_NO_C", "RequesterEmail", "FlowType",
                "ITEM_NO", "MATERIAL", "QUANTITY", "UNIT", "PLANT", "STOR_LOC", "DELIVERY_DATE"
            ];

            aColumns.forEach(function (sCol) {
                mColumnErrors[sCol] = 0;
            });

            aTableData.forEach(function (oRow) {
                aColumns.forEach(function (sCol) {
                    if (oRow["_err_" + sCol]) {
                        mColumnErrors[sCol]++;
                    }
                });
            });

            // Find columns with error rate > 50%
            var aColumnsToDelete = [];
            var iThreshold = Math.floor(aTableData.length * 0.5);
            
            aColumns.forEach(function (sCol) {
                if (mColumnErrors[sCol] > iThreshold) {
                    aColumnsToDelete.push(sCol + " (" + mColumnErrors[sCol] + " errors)");
                }
            });

            if (!aColumnsToDelete.length) {
                MessageToast.show("No columns with too many errors (>50%) to delete");
                return;
            }

            // Show dialog to select columns to delete
            var that = this;
            var oDialog = new sap.m.Dialog({
                title: "Delete Columns with Too Many Errors",
                content: new sap.m.VBox({
                    items: [
                        new sap.m.Text({ text: "The following columns have >50% errors:" }),
                        new sap.m.List({
                            items: aColumnsToDelete.map(function (sCol) {
                                return new sap.m.StandardListItem({ title: sCol, type: "Active" });
                            })
                        }),
                        new sap.m.Text({ text: "Are you sure you want to delete these columns?" })
                    ]
                }),
                beginButton: new sap.m.Button({
                    text: "Delete",
                    type: "Reject",
                    press: function () {
                        // Delete the columns from table data
                        var aUpdatedData = aTableData.map(function (oRow) {
                            var oNewRow = Object.assign({}, oRow);
                            aColumns.forEach(function (sCol) {
                                if (mColumnErrors[sCol] > iThreshold) {
                                    delete oNewRow[sCol];
                                    delete oNewRow["_err_" + sCol];
                                }
                            });
                            return oNewRow;
                        });

                        oModel.setProperty("/tableData", aUpdatedData);
                        oModel.setProperty("/csvPendingChanges", true);
                        that._refreshCSVPreviewValidation();
                        oDialog.close();
                        MessageToast.show("Deleted " + aColumnsToDelete.length + " columns");
                    }
                }),
                endButton: new sap.m.Button({
                    text: "Cancel",
                    press: function () {
                        oDialog.close();
                    }
                })
            });
            oDialog.open();
        },

        _resetState: function () {
            this._storedFile = null;
            this._storedBase64 = null;
            this._parsedExcelRows = null;
            this._parsedExcelOrders = null;
            this._resultAllData = [];
            this._quotationExpandState = {};
            this._activeResultScope = null;
            this._activeUploadStartedAt = null;
            this._stopResultAutoRefresh();

            var m = this.getView().getModel("status");
            m.setProperty("/step1Active", true);  m.setProperty("/step1Done", false);
            m.setProperty("/step2Active", false); m.setProperty("/step2Done", false);
            m.setProperty("/step3Active", false); m.setProperty("/step3Done", false);
            m.setProperty("/step4Active", false); m.setProperty("/step4Done", false);
            m.setProperty("/tableVisible", false);
            m.setProperty("/tableData", []);
            m.setProperty("/canExecute", false);
            m.setProperty("/resultVisible", false);
            m.setProperty("/resultData", []);
            m.setProperty("/resultAllData", []);
            m.setProperty("/resultFilterQuery", "");
            m.setProperty("/resultFilterStatus", "ALL");
            m.setProperty("/resultFlowType", "ALL");
            m.setProperty("/resultPendingCount", "0");
            m.setProperty("/resultBatchCount", "0");
            m.setProperty("/reqFormatIcon", "sap-icon://status-inactive");    m.setProperty("/reqFormatColor", "#6a6d70");
            m.setProperty("/reqSizeIcon", "sap-icon://status-inactive");      m.setProperty("/reqSizeColor", "#6a6d70");
            m.setProperty("/reqStructureIcon", "sap-icon://status-inactive"); m.setProperty("/reqStructureColor", "#6a6d70");
            m.setProperty("/csvDefaultSalesOrgError", false);
            m.setProperty("/csvDefaultDistrChanError", false);
            m.setProperty("/csvDefaultDivisionError", false);
            m.setProperty("/csvDefaultDocTypeError", false);
            m.setProperty("/csvDefaultPlantError", false);
            m.setProperty("/csvDefaultStorLocError", false);
            m.setProperty("/csvDefaultValidFromError", false);
            m.setProperty("/csvDefaultValidToError", false);
            m.setProperty("/csvDefaultPriceDateError", false);
            m.setProperty("/csvDefaultPriceDatePastError", false);
            m.setProperty("/csvDefaultDateRangeError", false);
            m.setProperty("/csvValidationText", "");
            m.setProperty("/csvValidationType", "None");
            m.setProperty("/csvPendingChanges", false);
            m.setProperty("/defaultFieldsPending", false);
            m.setProperty("/materialConfigPending", false);

            // Clear CSV-related instance variables
            this._isCSVFile = null;
            this._lastRawCSVContent = null;
            this._lastUploadedFileName = null;

            // Clear localStorage to prevent file restoration after navigation
            try {
                localStorage.removeItem("_lastIsCSVFile");
                localStorage.removeItem("_lastRawCSVContent");
                localStorage.removeItem("_lastUploadedFileName");
            } catch (e) {
                // Ignore localStorage errors
            }

            // Clear UploadSet control items
            var oUploadSet = this.byId("idUploadSet");
            if (oUploadSet && oUploadSet.removeAllItems) {
                oUploadSet.removeAllItems();
            }
        },

        _resetJSONState: function() {
            this._parsedJSONOrders = null;
            this._parsedJSONRoot = null;
            this._jsonInputShape = "orders";
            this._resultAllData = [];
            this._quotationExpandState = {};
            this._activeResultScope = null;
            this._activeUploadStartedAt = null;
            this._stopResultAutoRefresh();
            var m = this.getView().getModel("status");
            
            m.setProperty("/jsonInput", "");
            m.setProperty("/jsonValidationVisible", false);
            m.setProperty("/jsonValidationText", "");
            m.setProperty("/jsonValidationType", "None");
            m.setProperty("/jsonTableVisible", false);
            m.setProperty("/jsonTableData", []);
            m.setProperty("/jsonPreviewSummary", "Empty");
            m.setProperty("/jsonCanExecute", false);
            
            m.setProperty("/step1Active", true);  m.setProperty("/step1Done", false);
            m.setProperty("/step2Active", false); m.setProperty("/step2Done", false);
            m.setProperty("/step3Active", false); m.setProperty("/step3Done", false);
            m.setProperty("/step4Active", false); m.setProperty("/step4Done", false);
            m.setProperty("/resultVisible", false);
            m.setProperty("/resultData", []);
            m.setProperty("/resultAllData", []);
            m.setProperty("/resultFilterQuery", "");
            m.setProperty("/resultFilterStatus", "ALL");
            m.setProperty("/resultFlowType", "ALL");
            m.setProperty("/resultPendingCount", "0");
            m.setProperty("/resultBatchCount", "0");
        },

        onBatchFilterChange: function (oEvent) {
            var sQuery = (oEvent.getParameter("newValue") || "").trim();
            this._applyResultFilter(sQuery);
        },

        onResultStatusFilterChange: function (oEvent) {
            var oModel = this.getView().getModel("status");
            var oItem = oEvent.getParameter("item");
            var sKey = oItem && oItem.getKey ? oItem.getKey() : "ALL";
            oModel.setProperty("/resultFilterStatus", sKey);
            this._applyResultFilter(oModel.getProperty("/resultFilterQuery"));
        },

        onResultFlowTypeChange: function (oEvent) {
            var oModel = this.getView().getModel("status");
            var oItem = oEvent.getParameter("item");
            var sKey = oItem && oItem.getKey ? oItem.getKey() : "ALL";
            oModel.setProperty("/resultFlowType", sKey);
            this._applyResultFilter(oModel.getProperty("/resultFilterQuery"));
        },

        onToggleQuotationItems: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("status");
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject();
            if (!oRow || !oRow.isQuotationParent || !oRow.groupId) {
                return;
            }

            var bNextExpanded = !oRow.isExpanded;
            this._quotationExpandState[oRow.groupId] = bNextExpanded;

            this._resultAllData = (this._resultAllData || []).map(function (oItem) {
                if (oItem && oItem.groupId === oRow.groupId && oItem.isQuotationParent) {
                    return Object.assign({}, oItem, { isExpanded: bNextExpanded });
                }
                return oItem;
            });

            this._applyResultFilter(this.getView().getModel("status").getProperty("/resultFilterQuery"));
        },

        _resolveProcessListFromRow: function (oRow, sListKey) {
            var sKey = String(sListKey || "");
            if (!sKey || !oRow) {
                return [];
            }

            if (Array.isArray(oRow[sKey])) {
                return oRow[sKey];
            }

            var sParentGroupId = oRow.parentGroupId || oRow.groupId;
            if (!sParentGroupId) {
                return [];
            }

            var oParent = (this._resultAllData || []).find(function (oItem) {
                return !!oItem && oItem.groupId === sParentGroupId && oItem.isQuotationParent;
            });

            if (oParent && Array.isArray(oParent[sKey])) {
                return oParent[sKey];
            }

            return [];
        },

        _formatProcessDocLines: function (aItems, sType) {
            var aList = Array.isArray(aItems) ? aItems : [];
            var sKind = String(sType || "").toUpperCase();

            if (!aList.length) {
                return "No " + sKind + " data available.";
            }

            return aList.map(function (oItem, idx) {
                var oDoc = oItem || {};
                var sCode = sKind === "PO"
                    ? (oDoc.poNo || oDoc.purchaseOrder || oDoc.ebeln || oDoc.poNumber || "")
                    : (oDoc.preqNo || oDoc.prNo || oDoc.purchaseRequisition || oDoc.prNumber || "");
                var sItem = oDoc.preqItem || oDoc.poItem || oDoc.item || "";
                var sMat = oDoc.material || "";
                var sQty = oDoc.quantity || "";
                var sUnit = oDoc.unit || "";
                var sPlant = oDoc.plant || "";
                var sDate = oDoc.delivDate || oDoc.deliveryDate || "";
                var sStatus = oDoc.relStatus || oDoc.status || "";

                return [
                    (idx + 1) + ". " + (sKind || "DOC") + ": " + (sCode || "-"),
                    "   Item: " + (sItem || "-") +
                        " | Material: " + (sMat || "-") +
                        " | Qty: " + (sQty || "-") + " " + (sUnit || ""),
                    "   Plant: " + (sPlant || "-") +
                        " | Delivery: " + (sDate || "-") +
                        " | Status: " + (sStatus || "-")
                ].join("\n");
            }).join("\n\n");
        },

        _openProcessListDialog: function (sType, oRow, aItems) {
            var sKind = String(sType || "DOC").toUpperCase();
            var sSalesOrder = String((oRow && oRow.salesOrder) || "");
            var sTitle = "Danh sách " + sKind + (sSalesOrder ? (" - SO " + sSalesOrder) : "") + " (" + aItems.length + ")";
            var aRows = (Array.isArray(aItems) ? aItems : []).map(function (oItem, idx) {
                var oDoc = oItem || {};
                var sDocNo = sKind === "PO"
                    ? (oDoc.poNo || oDoc.purchaseOrder || oDoc.ebeln || oDoc.poNumber || "")
                    : (oDoc.preqNo || oDoc.prNo || oDoc.purchaseRequisition || oDoc.prNumber || "");

                return {
                    index: idx + 1,
                    docNo: sDocNo || "-",
                    itemNo: oDoc.preqItem || oDoc.poItem || oDoc.item || "-",
                    shortText: oDoc.shortText || "-",
                    material: oDoc.material || "-",
                    quantity: oDoc.quantity || "-",
                    unit: oDoc.unit || "",
                    plant: oDoc.plant || "-",
                    deliveryDate: oDoc.delivDate || oDoc.deliveryDate || "-",
                    status: oDoc.relStatus || oDoc.status || "-",
                    currency: oDoc.currency || "-",
                    netPrice: oDoc.netPrice || "-",
                    vendor: oDoc.vendor || "-",
                    purchOrg: oDoc.purchOrg || "-",
                    purGroup: oDoc.purGroup || "-",
                    acctAssCat: oDoc.acctAssCat || "-"
                };
            });

            var oDialogModel = new JSONModel({ rows: aRows });

            var oTable = new Table({
                fixedLayout: false,
                width: "100%",
                alternateRowColors: true,
                noDataText: "No " + sKind + " data available",
                growing: true,
                growingThreshold: 50,
                growingScrollToLoad: true,
                columns: [
                    new Column({ width: "3rem", hAlign: "Center", header: new Text({ text: "#" }) }),
                    new Column({ width: "12rem", header: new Text({ text: sKind }) }),
                    new Column({ width: "18rem", header: new Text({ text: "Description" }) }),
                    new Column({ width: "14rem", header: new Text({ text: "Material" }) }),
                    new Column({ width: "8rem", hAlign: "End", header: new Text({ text: "Quantity" }) }),
                    new Column({ width: "7rem", header: new Text({ text: "Plant" }) }),
                    new Column({ width: "10rem", header: new Text({ text: "Delivery" }) }),
                    new Column({ width: "8rem", header: new Text({ text: "Status" }) }),
                    new Column({ width: "12rem", header: new Text({ text: "Unit Price" }) }),
                    new Column({ width: "9rem", header: new Text({ text: "Vendor" }) }),
                    new Column({ width: "9rem", header: new Text({ text: "Purch.Org" }) }),
                    new Column({ width: "9rem", header: new Text({ text: "Pur.Group" }) })
                ]
            });

            oTable.setModel(oDialogModel, "dlg");
            oTable.bindItems({
                path: "dlg>/rows",
                template: new ColumnListItem({
                    cells: [
                        new ObjectNumber({ number: "{dlg>index}", emphasized: false }),
                        new ObjectIdentifier({ title: "{dlg>docNo}", text: "{dlg>itemNo}" }),
                        new Text({ text: "{dlg>shortText}" }),
                        new Text({ text: "{dlg>material}" }),
                        new ObjectNumber({ number: "{dlg>quantity}", unit: "{dlg>unit}", emphasized: false }),
                        new Text({ text: "{dlg>plant}" }),
                        new Text({ text: "{dlg>deliveryDate}" }),
                        new ObjectStatus({ text: "{dlg>status}" }),
                        new ObjectNumber({ number: "{dlg>netPrice}", unit: "{dlg>currency}", emphasized: false }),
                        new Text({ text: "{dlg>vendor}" }),
                        new Text({ text: "{dlg>purchOrg}" }),
                        new Text({ text: "{dlg>purGroup}" })
                    ]
                })
            });

            var oDialog = new Dialog({
                title: sTitle,
                contentWidth: "96vw",
                contentHeight: "84vh",
                stretch: true,
                draggable: false,
                resizable: true,
                content: [oTable],
                endButton: new Button({
                    text: "Đóng",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        _findParentResultRow: function (oRow) {
            if (!oRow) {
                return null;
            }

            if (oRow.isQuotationParent) {
                return oRow;
            }

            var sParentGroupId = String(oRow.parentGroupId || "").trim();
            if (!sParentGroupId) {
                return oRow;
            }

            var aSource = Array.isArray(this._resultAllData) ? this._resultAllData : [];
            for (var i = 0; i < aSource.length; i++) {
                var oCandidate = aSource[i];
                if (oCandidate && oCandidate.groupId === sParentGroupId) {
                    return oCandidate;
                }
            }

            return oRow;
        },

        _extractQuotationItemsForDialog: function (oParentRow) {
            var aItems = [];

            var fnToText = function (v) {
                return String(v == null ? "" : v).trim();
            };

            var fnMapItem = function (oItem, idx) {
                var o = oItem || {};
                return {
                    index: idx + 1,
                    itemNo: fnToText(o.itemNo || o.ItemNo),
                    material: fnToText(o.material || o.Material),
                    matDesc: fnToText(o.matDesc || o.MatDesc || o.materialDescription || o.MaterialDescription),
                    quantity: fnToText(o.quantity || o.Quantity),
                    unit: fnToText(o.salesUnit || o.SalesUnit || o.unit || o.Unit),
                    plant: fnToText(o.plant || o.Plant),
                    storLoc: fnToText(o.storLoc || o.StorLoc),
                    deliveryDate: fnToText(o.deliveryDate || o.DeliveryDate || o.delivDate || o.DelivDate),
                    netPrice: fnToText(o.netPrice || o.NetPrice),
                    itemValue: fnToText(o.itemValue || o.ItemValue),
                    currency: fnToText(o.currency || o.Currency)
                };
            };

            if (Array.isArray(oParentRow && oParentRow.quotationItems) && oParentRow.quotationItems.length) {
                aItems = oParentRow.quotationItems.map(fnMapItem);
            } else if (Array.isArray(oParentRow && oParentRow.items) && oParentRow.items.length) {
                aItems = oParentRow.items.map(fnMapItem);
            }

            if (!aItems.length && oParentRow && oParentRow.groupId) {
                var aSource = Array.isArray(this._resultAllData) ? this._resultAllData : [];
                var aChildren = aSource.filter(function (oRow) {
                    return !!oRow && oRow.parentGroupId === oParentRow.groupId;
                });

                aItems = aChildren.map(function (oChild, idx) {
                    var o = oChild || {};
                    return {
                        index: idx + 1,
                        itemNo: fnToText(o.itemNo),
                        material: fnToText(o.material),
                        matDesc: "",
                        quantity: fnToText(o.quantity),
                        unit: fnToText(o.unit),
                        plant: fnToText(o.plant),
                        storLoc: fnToText(o.storLoc),
                        deliveryDate: fnToText(o.deliveryDate),
                        netPrice: "",
                        itemValue: "",
                        currency: fnToText(o.currency || oParentRow.currency)
                    };
                });
            }

            return aItems.filter(function (oItem) {
                return !!(oItem.itemNo || oItem.material || oItem.quantity);
            });
        },

        _buildQuotationDetailHeaderText: function (oParentRow, aItems) {
            var oRow = oParentRow || {};
            var sQuotation = String(oRow.quotation || oRow.salesOrder || "").trim();
            var sQuotationNo = String(oRow.quotationNo || "").trim();
            var sDisplayReq = sQuotationNo && sQuotationNo !== sQuotation ? sQuotationNo : "-";
            var sItemCount = String((Array.isArray(aItems) ? aItems.length : 0) || oRow.itemCount || 0);

            var aLines = [
                "Quotation Number: " + (sQuotation || "-"),
                "Quotation Request: " + sDisplayReq,
                "Batch_ID: " + (String(oRow.batchId || "").trim() || "-"),
                "Sold-To: " + (String(oRow.soldTo || "").trim() || "-"),
                "Sold-To Name: " + (String(oRow.soldToName || "").trim() || "-"),
                "Currency: " + (String(oRow.currency || "").trim() || "-"),
                "Net/Tax/Gross: " +
                    (String(oRow.netValue || "").trim() || "-") + " / " +
                    (String(oRow.taxAmount || "").trim() || "-") + " / " +
                    (String(oRow.grossValue || "").trim() || "-"),
                "Validity: " +
                    (String(oRow.validFrom || "").trim() || "-") + " -> " +
                    (String(oRow.validTo || "").trim() || "-"),
                "Created By/At: " +
                    (String(oRow.createdBy || "").trim() || "-") + " / " +
                    (String(oRow.createdAt || "").trim() || "-"),
                "Item Count: " + (sItemCount || "0"),
                "Status: " + (String(oRow.docStatusText || "").trim() || "-")
            ];

            if (oRow.message) {
                aLines.push("Message: " + oRow.message);
            }

            return aLines.join("\n");
        },

        onOpenQuotationDetail: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("status");
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject() || {};
            var oParent = this._findParentResultRow(oRow) || oRow;
            var sQuotation = String(oParent.quotation || oParent.salesOrder || "").trim();

            if (!sQuotation || sQuotation === "N/A") {
                MessageToast.show("No Quotation Number available to view details");
                return;
            }

            var aItems = this._extractQuotationItemsForDialog(oParent);
            var oDialogModel = new JSONModel({
                headerText: this._buildQuotationDetailHeaderText(oParent, aItems),
                items: aItems
            });

            var oHeader = new TextArea({
                value: "{dlg>/headerText}",
                editable: false,
                growing: true,
                growingMaxLines: 12,
                width: "100%"
            });

            var oTable = new Table({
                fixedLayout: false,
                width: "100%",
                alternateRowColors: true,
                noDataText: "No item details for this quotation",
                columns: [
                    new Column({ width: "3rem", hAlign: "Center", header: new Text({ text: "#" }) }),
                    new Column({ width: "8rem", header: new Text({ text: "Item" }) }),
                    new Column({ width: "16rem", header: new Text({ text: "Material" }) }),
                    new Column({ width: "14rem", header: new Text({ text: "Material Desc" }) }),
                    new Column({ width: "8rem", hAlign: "End", header: new Text({ text: "Qty" }) }),
                    new Column({ width: "6rem", header: new Text({ text: "Unit" }) }),
                    new Column({ width: "7rem", header: new Text({ text: "Plant" }) }),
                    new Column({ width: "8rem", header: new Text({ text: "Stor Loc" }) }),
                    new Column({ width: "10rem", header: new Text({ text: "Delivery" }) }),
                    new Column({ width: "10rem", hAlign: "End", header: new Text({ text: "Net Price" }) }),
                    new Column({ width: "10rem", hAlign: "End", header: new Text({ text: "Item Value" }) })
                ]
            });

            oTable.setModel(oDialogModel, "dlg");
            oTable.bindItems({
                path: "dlg>/items",
                template: new ColumnListItem({
                    cells: [
                        new Text({ text: "{dlg>index}" }),
                        new Text({ text: "{dlg>itemNo}" }),
                        new Text({ text: "{dlg>material}" }),
                        new Text({ text: "{dlg>matDesc}" }),
                        new ObjectNumber({ number: "{dlg>quantity}", emphasized: false }),
                        new Text({ text: "{dlg>unit}" }),
                        new Text({ text: "{dlg>plant}" }),
                        new Text({ text: "{dlg>storLoc}" }),
                        new Text({ text: "{dlg>deliveryDate}" }),
                        new ObjectNumber({ number: "{dlg>netPrice}", unit: "{dlg>currency}", emphasized: false }),
                        new ObjectNumber({ number: "{dlg>itemValue}", unit: "{dlg>currency}", emphasized: false })
                    ]
                })
            });

            var sReq = String(oParent.quotationNo || "").trim();
            var sTitle = "Chi tiết Quotation " + sQuotation + (sReq && sReq !== sQuotation ? (" (" + sReq + ")") : "");

            var oDialog = new Dialog({
                title: sTitle,
                contentWidth: "98vw",
                contentHeight: "86vh",
                stretch: true,
                draggable: false,
                resizable: true,
                content: [oHeader, oTable],
                endButton: new Button({
                    text: "Đóng",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        onOpenPrListDialog: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("status");
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject() || {};
            var aPrs = this._resolveProcessListFromRow(oRow, "prs");
            if (!aPrs.length) {
                MessageToast.show("No PR list to display");
                return;
            }

            this._openProcessListDialog("PR", oRow, aPrs);
        },

        onOpenPoListDialog: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("status");
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject() || {};
            var aPos = this._resolveProcessListFromRow(oRow, "pos");
            if (!aPos.length) {
                MessageToast.show("No PO list to display");
                return;
            }

            this._openProcessListDialog("PO", oRow, aPos);
        },

        _isQuotationParentRow: function (oRow) {
            return !!(oRow && oRow.isQuotationParent);
        },

        _isQuotationItemRow: function (oRow) {
            return !!(oRow && oRow.isChildItem);
        },

        _matchesResultQuery: function (oRow, sNeedle) {
            if (!sNeedle) {
                return true;
            }

            var aFields = [
                oRow.batchId,
                oRow.material,
                oRow.salesOrder,
                oRow.delivery,
                oRow.billing,
                oRow.flowStage,
                oRow.flowType,
                oRow.prListText,
                oRow.poListText,
                oRow.quotationNo,
                oRow.itemNo,
                oRow.message
            ];

            return aFields.some(function (v) {
                return String(v || "").toLowerCase().indexOf(sNeedle) !== -1;
            });
        },

        _matchesResultFlowType: function (oRow, sFilterKey) {
            var sRowFlow = String(oRow?.flowType || "Order-to-Cash").toUpperCase();

            // Support both old and new FlowType values for filtering
            if (sFilterKey === "SALES" || sFilterKey === "Order-to-Cash" || sFilterKey === "O2C") {
                return sRowFlow === "SALES" || sRowFlow === "ORDER-TO-CASH" || sRowFlow === "O2C" || sRowFlow === "ORDERTOCASH";
            }

            if (sFilterKey === "PROCUREMENT" || sFilterKey === "Make-to-Order" || sFilterKey === "MTO") {
                return sRowFlow === "PROCUREMENT" || sRowFlow === "MAKE-TO-ORDER" || sRowFlow === "MTO" || sRowFlow === "MAKETOORDER";
            }

            return true;
        },

        _countResultBusinessRows: function (aRows) {
            var aList = Array.isArray(aRows) ? aRows : [];
            var hasParentRows = aList.some(function (oRow) { return !!(oRow && oRow.isQuotationParent); });

            if (!hasParentRows) {
                return aList.length;
            }

            return aList.filter(function (oRow) {
                return !!oRow && !oRow.isQuotationParent;
            }).length;
        },

        _withDisplayIndex: function (aRows) {
            var iDisplay = 0;
            return (aRows || []).map(function (oRow) {
                var oCopy = Object.assign({}, oRow);
                if (oCopy.isChildItem) {
                    oCopy.displayIndex = "";
                    return oCopy;
                }
                iDisplay++;
                oCopy.displayIndex = iDisplay;
                return oCopy;
            });
        },

        _isRowPendingLike: function (oRow) {
            var sDocStatus = String((oRow && oRow.docStatus) || "").toUpperCase();
            if (sDocStatus === "PENDING") {
                return true;
            }
            if (sDocStatus !== "WARNING") {
                return false;
            }

            var sHint = [
                oRow && oRow.docStatusText,
                oRow && oRow.flowStage,
                oRow && oRow.message,
                oRow && oRow.currentStage
            ].join(" ").toUpperCase();

            return (
                sHint.indexOf("CHO KET QUA") !== -1 ||
                sHint.indexOf("CHỜ KẾT QUẢ") !== -1 ||
                sHint.indexOf("DANG XU LY") !== -1 ||
                sHint.indexOf("ĐANG XỬ LÝ") !== -1 ||
                sHint.indexOf("SUBMITTED") !== -1 ||
                sHint.indexOf("DISPATCHER") !== -1 ||
                sHint.indexOf("RUNNING") !== -1 ||
                sHint.indexOf("PROCESS") !== -1 ||
                sHint.indexOf("QUEUE") !== -1 ||
                sHint.indexOf("WAIT") !== -1 ||
                sHint.indexOf("APPROVAL") !== -1
            );
        },

        _matchesResultStatus: function (oRow, sFilterKey) {
            var sDocStatus = String(oRow?.docStatus || "").toUpperCase();

            if (sFilterKey === "SUCCESS") {
                return sDocStatus === "SUCCESS";
            }
            if (sFilterKey === "PENDING") {
                return this._isRowPendingLike(oRow);
            }
            if (sFilterKey === "ERROR") {
                return sDocStatus === "ERROR";
            }

            return true;
        },

        _applyResultFilter: function (sQuery) {
            var oModel = this.getView().getModel("status");
            var aSource = Array.isArray(this._resultAllData) ? this._resultAllData : [];
            var sQueryResolved = typeof sQuery === "string"
                ? sQuery
                : (oModel.getProperty("/resultFilterQuery") || "");
            var sNeedle = sQueryResolved.trim().toLowerCase();
            var sFilterStatus = oModel.getProperty("/resultFilterStatus") || "ALL";
            var sFilterFlowType = oModel.getProperty("/resultFlowType") || "ALL";

            oModel.setProperty("/resultFilterQuery", sQueryResolved);

            var mParents = {};
            var mChildrenByParent = {};

            aSource.forEach(function (oRow) {
                if (this._isQuotationParentRow(oRow) && oRow.groupId) {
                    mParents[oRow.groupId] = oRow;
                    mChildrenByParent[oRow.groupId] = mChildrenByParent[oRow.groupId] || [];
                    return;
                }

                if (this._isQuotationItemRow(oRow) && oRow.parentGroupId) {
                    mChildrenByParent[oRow.parentGroupId] = mChildrenByParent[oRow.parentGroupId] || [];
                    mChildrenByParent[oRow.parentGroupId].push(oRow);
                }
            }.bind(this));

            var aFiltered = [];

            aSource.forEach(function (oRow) {
                if (this._isQuotationParentRow(oRow)) {
                    var aChildren = mChildrenByParent[oRow.groupId] || [];
                    var bParentStatus = this._matchesResultStatus(oRow, sFilterStatus);
                    var bChildStatusMatch = aChildren.some(function (oChild) {
                        return this._matchesResultStatus(oChild, sFilterStatus);
                    }.bind(this));
                    var bParentFlowMatch = this._matchesResultFlowType(oRow, sFilterFlowType);
                    var bChildFlowMatch = aChildren.some(function (oChild) {
                        return this._matchesResultFlowType(oChild, sFilterFlowType);
                    }.bind(this));

                    if (!bParentStatus && !bChildStatusMatch) {
                        return;
                    }
                    if (!bParentFlowMatch && !bChildFlowMatch) {
                        return;
                    }

                    var bParentQueryMatch = this._matchesResultQuery(oRow, sNeedle);
                    var aChildrenQueryMatched = aChildren.filter(function (oChild) {
                        return this._matchesResultStatus(oChild, sFilterStatus)
                            && this._matchesResultFlowType(oChild, sFilterFlowType)
                            && this._matchesResultQuery(oChild, sNeedle);
                    }.bind(this));

                    if (!bParentQueryMatch && aChildrenQueryMatched.length === 0) {
                        return;
                    }

                    var bExpanded = !!(oRow.isExpanded || this._quotationExpandState[oRow.groupId]);
                    var oParentClone = Object.assign({}, oRow, { isExpanded: bExpanded });
                    aFiltered.push(oParentClone);

                    if (bExpanded) {
                        var aChildrenToShow = bParentQueryMatch
                            ? aChildren.filter(function (oChild) {
                                return this._matchesResultStatus(oChild, sFilterStatus)
                                    && this._matchesResultFlowType(oChild, sFilterFlowType);
                            }.bind(this))
                            : aChildrenQueryMatched;

                        aChildrenToShow.forEach(function (oChild) {
                            aFiltered.push(oChild);
                        });
                    }
                    return;
                }

                if (this._isQuotationItemRow(oRow)) {
                    // Child rows are handled together with parent row for expand/collapse control.
                    return;
                }

                if (!this._matchesResultStatus(oRow, sFilterStatus)) {
                    return;
                }

                if (!this._matchesResultFlowType(oRow, sFilterFlowType)) {
                    return;
                }

                if (!this._matchesResultQuery(oRow, sNeedle)) {
                    return;
                }

                aFiltered.push(oRow);
            }.bind(this));

            oModel.setProperty("/resultData", this._withDisplayIndex(aFiltered));
        },

        /* ══════════════════════════════════════
           JSON UPLOAD HANDLERS
           ══════════════════════════════════════ */
        _getJSONOrdersPayload: function (oData) {
            if (oData && Array.isArray(oData.Orders)) {
                return { shape: "Orders", orders: oData.Orders };
            }

            if (oData && Array.isArray(oData.orders)) {
                return { shape: "orders", orders: oData.orders };
            }

            if (oData && Array.isArray(oData.Order)) {
                return { shape: "Order", orders: oData.Order };
            }

            throw new Error("JSON phải có cấu trúc: { \"Orders\": [...] } hoặc { \"orders\": [...] } hoặc { \"Order\": [...] }");
        },

        _sanitizeJSONInput: function (sInput) {
            var s = String(sInput || "");

            // Normalize copy/paste artifacts from office tools/editors.
            s = s.replace(/^\uFEFF/, "");
            s = s.replace(/[\u200B\u200C\u200D]/g, "");
            s = s.replace(/[\u201C\u201D]/g, '"');
            s = s.replace(/[\u2018\u2019]/g, "'");
            s = s.replace(/[\uFF1A]/g, ":");

            // Remove trailing commas before object/array close.
            s = s.replace(/,\s*([}\]])/g, "$1");

            return s.trim();
        },

        _parseJSONInputRobust: function (sInput) {
            var sSanitized = this._sanitizeJSONInput(sInput);
            var oPrimaryError = null;

            try {
                return {
                    data: JSON.parse(sSanitized),
                    sanitizedText: sSanitized,
                    usedRepair: sSanitized !== String(sInput || "")
                };
            } catch (e) {
                oPrimaryError = e;
            }

            // Second pass: repair common JSON-like mistakes.
            var sRepaired = sSanitized;
            sRepaired = sRepaired.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":');
            sRepaired = sRepaired.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, function (_, sInner) {
                return '"' + String(sInner).replace(/\"/g, '"').replace(/"/g, '\\"') + '"';
            });
            sRepaired = sRepaired.replace(/,\s*([}\]])/g, "$1");

            try {
                return {
                    data: JSON.parse(sRepaired),
                    sanitizedText: sRepaired,
                    usedRepair: true
                };
            } catch (e2) {
                var sHint = "Vui lòng kiểm tra dấu ngoặc, dấu phẩy và dấu nháy kép cho key/value.";
                throw new Error((oPrimaryError && oPrimaryError.message ? oPrimaryError.message : e2.message) + " | " + sHint);
            }
        },

        _getJSONDefaults: function () {
            var oStatusModel = this.getView().getModel("status");
            var oAppModel = this.getOwnerComponent().getModel("app");
            var sUserEmail = String((oAppModel && oAppModel.getProperty("/userEmail")) || "").trim();

            return {
                SALES_ORG: String(oStatusModel.getProperty("/jsonDefaultSalesOrg") || "").trim(),
                DISTR_CHAN: String(oStatusModel.getProperty("/jsonDefaultDistrChan") || "").trim(),
                DIVISION: String(oStatusModel.getProperty("/jsonDefaultDivision") || "").trim(),
                DOC_TYPE: String(oStatusModel.getProperty("/jsonDefaultDocType") || "").trim(),
                PLANT: String(oStatusModel.getProperty("/jsonDefaultPlant") || "").trim(),
                STOR_LOC: String(oStatusModel.getProperty("/jsonDefaultStorLoc") || "").trim(),
                VALID_FROM: this._formatDateForPayload(oStatusModel.getProperty("/jsonDefaultValidFrom")),
                VALID_TO: this._formatDateForPayload(oStatusModel.getProperty("/jsonDefaultValidTo")),
                PRICE_DATE: this._formatDateForPayload(oStatusModel.getProperty("/jsonDefaultPriceDate")),
                UNIT: "EA",
                RequesterEmail: String(oStatusModel.getProperty("/jsonDefaultRequesterEmail") || sUserEmail || "toanncse182505@fpt.edu.vn").trim()
            };
        },

        _todayISODate: function () {
            return DateUtils.todayISODate();
        },

        _parseStrictISODate: function (sValue) {
            var s = String(sValue || "").trim();
            if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
                return null;
            }
            return DateUtils.parseDate(s);
        },

        _normalizeFlowType: function (sFlowType) {
            var sType = String(sFlowType || "").toLowerCase();
            if (sType.indexOf("make-to-order") !== -1 || sType.indexOf("mto") !== -1 || sType.indexOf("maketoorder") !== -1) {
                return "Make-to-Order";
            }
            if (sType.indexOf("order-to-cash") !== -1 || sType.indexOf("o2c") !== -1 || sType.indexOf("ordertocash") !== -1) {
                return "Order-to-Cash";
            }
            if (sType.indexOf("procurement") !== -1 || sType.indexOf("purchase") !== -1 || sType.indexOf("prs") !== -1) {
                return "Make-to-Order";
            }
            if (sType.indexOf("sales") !== -1 || sType.indexOf("cash") !== -1 || sType.indexOf("order") !== -1) {
                return "Order-to-Cash";
            }
            return "";
        },

        _getDeliveryLeadConfig: function () {
            var oModel = this.getView().getModel("status");
            var nO2C = parseInt(oModel.getProperty("/deliveryLeadMonthsO2C"), 10);
            var nMTO = parseInt(oModel.getProperty("/deliveryLeadMonthsMTO"), 10);

            if (!Number.isFinite(nO2C) || nO2C <= 0) {
                nO2C = 1;
            }
            if (!Number.isFinite(nMTO) || nMTO <= 0) {
                nMTO = 3;
            }

            return {
                o2cMonths: nO2C,
                mtoMonths: nMTO
            };
        },

        _getDeliveryLeadMonthsForProcessType: function (sProcessType) {
            var sType = this._normalizeFlowType(sProcessType);
            var mConfig = this._getDeliveryLeadConfig();
            if (sType === "Make-to-Order") {
                return mConfig.mtoMonths;
            }
            return mConfig.o2cMonths;
        },

        _getDefaultDeliveryDateForProcessType: function (sProcessType) {
            var nMonths = this._getDeliveryLeadMonthsForProcessType(sProcessType);
            var oDate = new Date();
            oDate.setHours(0, 0, 0, 0);
            oDate.setMonth(oDate.getMonth() + nMonths);
            return this._formatISODate(oDate);
        },

        _validateDeliveryDateLeadTime: function (oDate, sProcessType) {
            if (!oDate) {
                return { valid: true, message: null };
            }

            var sType = this._normalizeFlowType(sProcessType);
            var nMonths = this._getDeliveryLeadMonthsForProcessType(sType);
            var oMinDate = new Date();
            oMinDate.setHours(0, 0, 0, 0);
            oMinDate.setMonth(oMinDate.getMonth() + nMonths);

            var oCheckDate = new Date(oDate);
            oCheckDate.setHours(0, 0, 0, 0);

            if (oCheckDate < oMinDate) {
                return {
                    valid: false,
                    message: sType + " requires Delivery Date to be at least " + nMonths + " month(s) from today."
                };
            }

            return { valid: true, message: null };
        },

        _getMaterialProcessType: function (sMaterial) {
            var sMat = String(sMaterial || "").toUpperCase().trim();
            var oModel = this.getView().getModel("status");
            var aConfig = oModel.getProperty("/materialProcessTypeConfig") || [];

            for (var i = 0; i < aConfig.length; i++) {
                if (String(aConfig[i].material || "").toUpperCase().trim() === sMat) {
                    return aConfig[i].processType;
                }
            }
            return null;
        },

        onAddMaterialConfig: function () {
            var oModel = this.getView().getModel("status");
            var aConfig = oModel.getProperty("/materialProcessTypeConfigDraft") || [];
            aConfig.push({ material: "", processType: "Make-to-Order" });
            oModel.setProperty("/materialProcessTypeConfigDraft", aConfig);
            oModel.setProperty("/materialConfigPending", true);
        },

        onRemoveMaterialConfig: function (oEvent) {
            var oModel = this.getView().getModel("status");
            var aConfig = oModel.getProperty("/materialProcessTypeConfigDraft") || [];
            var oItem = oEvent.getSource().getParent();
            var oTable = oItem.getParent();
            var iIndex = oTable.indexOfItem(oItem);

            if (iIndex >= 0 && iIndex < aConfig.length) {
                aConfig.splice(iIndex, 1);
                oModel.setProperty("/materialProcessTypeConfigDraft", aConfig);
                oModel.setProperty("/materialConfigPending", true);
            }
        },

        onResetMaterialConfig: function () {
            var oModel = this.getView().getModel("status");
            oModel.setProperty("/materialProcessTypeConfigDraft", [
                { material: "EV_MOTOR_01", processType: "Make-to-Order" },
                { material: "WILA_TIRE_01", processType: "Order-to-Cash" }
            ]);
            oModel.setProperty("/deliveryLeadMonthsO2CDraft", 1);
            oModel.setProperty("/deliveryLeadMonthsMTODraft", 3);
            oModel.setProperty("/deliveryLeadO2CError", false);
            oModel.setProperty("/deliveryLeadMTOError", false);
            oModel.setProperty("/materialConfigPending", true);
        },

        onMaterialConfigChange: function () {
            var oModel = this.getView().getModel("status");
            oModel.setProperty("/materialConfigPending", true);
            oModel.setProperty("/deliveryLeadO2CError", false);
            oModel.setProperty("/deliveryLeadMTOError", false);
        },

        onApplyMaterialConfig: function () {
            var oModel = this.getView().getModel("status");
            var aDraft = oModel.getProperty("/materialProcessTypeConfigDraft") || [];
            var aNormalized = [];
            var aMissingMaterial = [];
            var aMissingType = [];

            aDraft.forEach(function (oItem, iIndex) {
                var sMaterial = String((oItem && oItem.material) || "").trim();
                var sProcessType = String((oItem && oItem.processType) || "").trim();

                if (!sMaterial && !sProcessType) {
                    return;
                }

                if (!sMaterial) {
                    aMissingMaterial.push(iIndex + 1);
                    return;
                }

                if (!sProcessType) {
                    aMissingType.push(iIndex + 1);
                    return;
                }

                aNormalized.push({ material: sMaterial, processType: sProcessType });
            });

            var nLeadO2C = parseInt(oModel.getProperty("/deliveryLeadMonthsO2CDraft"), 10);
            var nLeadMTO = parseInt(oModel.getProperty("/deliveryLeadMonthsMTODraft"), 10);
            var bLeadO2CError = !Number.isFinite(nLeadO2C) || nLeadO2C <= 0;
            var bLeadMTOError = !Number.isFinite(nLeadMTO) || nLeadMTO <= 0;

            oModel.setProperty("/deliveryLeadO2CError", bLeadO2CError);
            oModel.setProperty("/deliveryLeadMTOError", bLeadMTOError);

            if (bLeadO2CError || bLeadMTOError) {
                MessageBox.error("Delivery lead months must be a positive number.");
                return;
            }

            if (aMissingMaterial.length || aMissingType.length) {
                var aProblems = [];
                if (aMissingMaterial.length) {
                    aProblems.push("Missing Material at row(s): " + aMissingMaterial.join(", "));
                }
                if (aMissingType.length) {
                    aProblems.push("Missing Process Type at row(s): " + aMissingType.join(", "));
                }
                MessageBox.error(aProblems.join("\n"));
                return;
            }

            oModel.setProperty("/materialProcessTypeConfig", aNormalized);
            oModel.setProperty(
                "/materialProcessTypeConfigDraft",
                aNormalized.map(function (oItem) {
                    return { material: oItem.material, processType: oItem.processType };
                })
            );
            oModel.setProperty("/deliveryLeadMonthsO2C", nLeadO2C);
            oModel.setProperty("/deliveryLeadMonthsMTO", nLeadMTO);
            oModel.setProperty("/deliveryLeadMonthsO2CDraft", nLeadO2C);
            oModel.setProperty("/deliveryLeadMonthsMTODraft", nLeadMTO);
            oModel.setProperty("/materialConfigPending", false);

            this._refreshCSVPreviewValidation();
            MessageToast.show("Material configuration applied");
        },

        _validateMaterialProcessType: function (sMaterial, sProcessType) {
            var sExpectedType = this._getMaterialProcessType(sMaterial);
            if (!sExpectedType) {
                return { valid: true, message: null };
            }
            var sActualType = this._normalizeFlowType(sProcessType);
            if (sActualType !== sExpectedType) {
                return {
                    valid: false,
                    message: "Material " + sMaterial + " phải sử dụng Process Type '" + sExpectedType + "' (hiện tại: '" + sProcessType + "')"
                };
            }
            return { valid: true, message: null };
        },

        _enrichDispatcherOrderWithDefaults: function (oOrder, mDefaults) {
            var o = Object.assign({}, oOrder || {});
            var m = mDefaults || this._getJSONDefaults();
            var sToday = this._todayISODate();

            // Output using new field names only (camelCase)
            o.DocType = String(o.DocType || o.DOC_TYPE || m.DOC_TYPE || "").trim();
            o.SalesOrg = String(o.SalesOrg || o.SALES_ORG || m.SALES_ORG || "").trim();
            o.DistrChannel = String(o.DistrChannel || o.DISTR_CHAN || o.Channel || m.DISTR_CHAN || "").trim();
            o.Division = String(o.Division || o.DIVISION || m.DIVISION || "").trim();

            // Date fields with defaults
            o.ValidFrom = this._formatDateForPayload(o.ValidFrom || o.VALID_FROM || m.VALID_FROM);
            var sValidTo = String(o.ValidTo || "").trim();
            if (!sValidTo && o.VALID_TO) {
                sValidTo = o.VALID_TO;
            }
            if (!sValidTo && m.VALID_TO) {
                sValidTo = m.VALID_TO;
            }
            o.ValidTo = this._formatDateForPayload(sValidTo);

            o.PriceDate = this._formatDateForPayload(o.PriceDate || o.PRICE_DATE || m.PRICE_DATE);

            // Party information - use new field names only
            var sSoldTo = String(o.SoldToParty || o.SOLD_TO || o.SoldTo || "").trim();
            o.SoldToParty = sSoldTo;
            o.ShipToParty = String(o.ShipToParty || o.SHIP_TO || o.ShipTo || sSoldTo).trim();
            o.BillToParty = String(o.BillToParty || o.BILL_TO || o.BillTo || sSoldTo).trim();
            o.Payer = String(o.Payer || o.PAYER || sSoldTo).trim();

            // Process Type
            var sFlowType = this._normalizeFlowType(o.ProcessType || o.processType || o.FlowType || o.flowType);
            o.ProcessType = sFlowType;

            // Requester Email
            if (!o.RequesterEmail && m.RequesterEmail) {
                o.RequesterEmail = m.RequesterEmail;
            }

            // PO Number
            if (!o.PO) {
                o.PO = m.PURCH_NO_C || m.PO || "";
            } else {
                o.PO = String(o.PO).trim();
            }

            var aItems = this._getDispatcherItems(o);
            if (aItems.length) {
                var aNormalizedItems = aItems.map(function (oItem) {
                    var it = Object.assign({}, oItem || {});

                    // Item fields - output using new field names only
                    it.Material = String(it.Material || it.MATERIAL || "").trim();
                    it.Quantity = String(it.Quantity || it.QUANTITY || "").trim();
                    it.Unit = String(it.Unit || m.UNIT || "EA").trim() || "EA";
                    it.Plant = String(it.Plant || it.PLANT || m.PLANT || "").trim();
                    it.StorageLoc = String(it.StorageLoc || it.STOR_LOC || m.STOR_LOC || "").trim();
                    it.ItemNo = String(it.ItemNo || it.ITEM_NO || "").trim();
                    it.DeliveryDate = String(it.DeliveryDate || it.DELIVERY_DATE || "").trim();

                    // Format existing DeliveryDate to YYYY-MM-DD if provided
                    if (it.DeliveryDate) {
                        var oParsedDeliveryDate = this._parseFlexibleDate(it.DeliveryDate);
                        if (oParsedDeliveryDate) {
                            it.DeliveryDate = this._formatISODate(oParsedDeliveryDate);
                        }
                    }

                    // Auto-fill DELIVERY_DATE if not provided based on ProcessType
                    if (!it.DeliveryDate) {
                        it.DeliveryDate = this._getDefaultDeliveryDateForProcessType(sFlowType);
                    }

                    // Delete old SAP field names from items
                    delete it.ITEM_NO;
                    delete it.UNIT;
                    delete it.PLANT;
                    delete it.STOR_LOC;
                    delete it.QUANTITY;
                    delete it.DELIVERY_DATE;
                    delete it.itemNo;
                    delete it.MATERIAL;

                    return it;
                }.bind(this));

                // Build ItemLine structure
                var oItemsContainer = { item: aNormalizedItems };
                o.ItemLine = oItemsContainer;
            }

            // Delete all old SAP field names to keep only new camelCase names
            delete o.DOC_TYPE;
            delete o.SALES_ORG;
            delete o.DISTR_CHAN;
            delete o.DistrChan;
            delete o.Channel;
            delete o.DIVISION;
            delete o.VALID_FROM;
            delete o.VALID_TO;
            delete o.PRICE_DATE;
            delete o.SOLD_TO;
            delete o.SoldTo;
            delete o.SHIP_TO;
            delete o.ShipTo;
            delete o.PAYER;
            delete o.BILL_TO;
            delete o.BillTo;
            delete o.FlowType;
            delete o.flowType;
            delete o.processType;
            delete o.PURCH_NO_C;
            delete o.IT_ITEMS;

            return o;
        },

        _applyJSONDefaultsToOrders: function (aOrders, mDefaults) {
            return (Array.isArray(aOrders) ? aOrders : []).map(function (oOrder) {
                var bDispatcherLike = this._isDispatcherOrderFormat(oOrder)
                    || !!(oOrder && (oOrder.IT_ITEMS || oOrder.ItemLine || oOrder.SOLD_TO || oOrder.SoldTo || oOrder.SoldToParty || oOrder.QT_REQ_ID || oOrder.SalesOrg || oOrder.DocType));

                if (bDispatcherLike) {
                    return this._enrichDispatcherOrderWithDefaults(oOrder, mDefaults);
                }

                return Object.assign({}, oOrder);
            }.bind(this));
        },

        _isDispatcherOrderFormat: function (o) {
            return !!(
                o.DOC_TYPE ||
                o.SALES_ORG ||
                o.SOLD_TO ||
                o.SoldToParty ||
                o.ProcessType ||
                (o.IT_ITEMS && (Array.isArray(o.IT_ITEMS.item) || typeof o.IT_ITEMS.item === "object")) ||
                (o.ItemLine && (Array.isArray(o.ItemLine.item) || typeof o.ItemLine.item === "object"))
            );
        },

        _getDispatcherItems: function (oOrder) {
            var o = oOrder || {};
            // Support both new (ItemLine) and old (IT_ITEMS) structure
            var mItems = o.ItemLine || o.IT_ITEMS;

            if (!mItems) {
                return [];
            }

            if (Array.isArray(mItems)) {
                return mItems;
            }

            if (Array.isArray(mItems.item)) {
                return mItems.item;
            }

            if (mItems.item && typeof mItems.item === "object") {
                return [mItems.item];
            }

            return [];
        },

        _inferFlowTypeFromInputOrder: function (oOrder) {
            var o = oOrder || {};
            var sNormalized = this._normalizeFlowType(o.FlowType || o.flowType || o.processType || o.ProcessType);
            if (sNormalized) {
                return sNormalized.toUpperCase();
            }

            var sHint = String(
                o.flowType || o.FlowType || o.processType || o.ProcessType ||
                o.route || o.Route || o.path || o.Path || ""
            ).toUpperCase();

            if (
                sHint.indexOf("PROCUREMENT") !== -1 ||
                sHint.indexOf("MTO") !== -1 ||
                sHint.indexOf("PURCHASE") !== -1 ||
                sHint.indexOf("CREATE_PRS") !== -1 ||
                sHint.indexOf("CREATE_PO") !== -1 ||
                sHint.indexOf("PRS_") !== -1 ||
                sHint.indexOf("PO_") !== -1
            ) {
                return "PROCUREMENT";
            }

            return "SALES";
        },

        _validateJSONOrder: function (oOrder, iIndex) {
            var iOrderNo = iIndex + 1;
            var oDefaults = this._getJSONDefaults();
            var oValidatedOrder = Object.assign({}, oOrder || {});

            if (this._isDispatcherOrderFormat(oValidatedOrder)) {
                oValidatedOrder = this._enrichDispatcherOrderWithDefaults(oValidatedOrder, oDefaults);

                if (!oValidatedOrder || typeof oValidatedOrder !== "object" || Object.keys(oValidatedOrder).length === 0) {
                    throw new Error("Order #" + iOrderNo + " must not be empty");
                }

                // Only check required fields for new JSON structure
                // Other fields will be auto-filled from Default Information
                var sSoldTo = this._getFirstJSONValue(oValidatedOrder, ["SOLD_TO", "SoldTo", "SoldToParty"]);
                var sFlowType = this._normalizeFlowType(this._getFirstJSONValue(oValidatedOrder, ["FlowType", "flowType", "processType", "ProcessType"]));
                var aItems = this._getDispatcherItems(oValidatedOrder);

                if (!sSoldTo) {
                    throw new Error("Order #" + iOrderNo + " missing required field: SoldToParty");
                }
                if (!this._isValidCustomerCode(sSoldTo)) {
                    throw new Error("Order #" + iOrderNo + " SoldToParty must contain only digits and must not exceed 10 digits");
                }
                ["DocType", "SalesOrg", "DistrChannel", "Division", "ValidFrom", "ValidTo", "PriceDate"].forEach(function (sField) {
                    var sValue = this._getFirstJSONValue(oValidatedOrder, [
                        sField,
                        sField.toUpperCase(),
                        sField === "SalesOrg" ? "SALES_ORG" : "",
                        sField === "DistrChannel" ? "DISTR_CHAN" : "",
                        sField === "ValidFrom" ? "VALID_FROM" : "",
                        sField === "ValidTo" ? "VALID_TO" : "",
                        sField === "PriceDate" ? "PRICE_DATE" : ""
                    ]);

                    if (!sValue) {
                        throw new Error("Order #" + iOrderNo + " missing default field: " + sField);
                    }
                }.bind(this));

                var oValidFrom = this._parseFlexibleDate(this._getFirstJSONValue(oValidatedOrder, ["ValidFrom", "VALID_FROM"]));
                var oValidTo = this._parseFlexibleDate(this._getFirstJSONValue(oValidatedOrder, ["ValidTo", "VALID_TO"]));
                var oPriceDate = this._parseFlexibleDate(this._getFirstJSONValue(oValidatedOrder, ["PriceDate", "PRICE_DATE"]));
                if (!oValidFrom) {
                    throw new Error("Order #" + iOrderNo + " ValidFrom is invalid. Use dd/MM/yyyy or yyyy-MM-dd");
                }
                if (!oValidTo) {
                    throw new Error("Order #" + iOrderNo + " ValidTo is invalid. Use dd/MM/yyyy or yyyy-MM-dd");
                }
                if (oValidFrom && oValidTo && oValidTo.getTime() <= oValidFrom.getTime()) {
                    throw new Error("Order #" + iOrderNo + " ValidTo must be after ValidFrom");
                }
                if (!oPriceDate || !this._isDateWithinCurrentMonthFromToday(oPriceDate)) {
                    throw new Error("Order #" + iOrderNo + " PriceDate must be between today and the end of the current month");
                }
                if (!sFlowType) {
                    throw new Error("Order #" + iOrderNo + " missing or invalid Process Type (only Order-to-Cash or Make-to-Order accepted)");
                }
                if (!aItems.length) {
                    throw new Error("Order #" + iOrderNo + " missing ItemLine.item or IT_ITEMS.item list");
                }

                for (var i = 0; i < aItems.length; i++) {
                    var oItem = aItems[i] || {};
                    var iItemNo = i + 1;
                    // ITEM_NO is optional - CPI will auto-generate if missing
                    var sMaterial = this._getFirstJSONValue(oItem, ["MATERIAL", "Material"]);
                    var sUnit = this._getFirstJSONValue(oItem, ["UNIT", "Unit"]);
                    var nQty = Number(oItem.QUANTITY || oItem.Quantity || 0);
                    var sDeliveryDate = this._getFirstJSONValue(oItem, ["DELIVERY_DATE", "DeliveryDate"]);

                    if (!sMaterial) {
                        throw new Error("Order #" + iOrderNo + " missing Material at item #" + iItemNo);
                    }
                    if (!this._getFirstJSONValue(oItem, ["Plant", "PLANT"])) {
                        throw new Error("Order #" + iOrderNo + " missing default field: Plant at item #" + iItemNo);
                    }
                    if (!this._getFirstJSONValue(oItem, ["StorageLoc", "STOR_LOC"])) {
                        throw new Error("Order #" + iOrderNo + " missing default field: StorageLoc at item #" + iItemNo);
                    }
                    if (!Number.isFinite(nQty) || nQty <= 0) {
                        throw new Error("Order #" + iOrderNo + " has invalid Quantity at item #" + iItemNo);
                    }

                    if (sDeliveryDate) {
                        var oDeliveryDate = this._parseFlexibleDate(sDeliveryDate);
                        if (!oDeliveryDate) {
                            throw new Error("Order #" + iOrderNo + " has invalid Delivery Date at item #" + iItemNo);
                        }

                        var oLeadValidation = this._validateDeliveryDateLeadTime(oDeliveryDate, sFlowType);
                        if (!oLeadValidation.valid) {
                            throw new Error("Order #" + iOrderNo + " at item #" + iItemNo + ": " + oLeadValidation.message);
                        }
                    }

                    // Validate Material-ProcessType compatibility
                    var oValidation = this._validateMaterialProcessType(sMaterial, sFlowType);
                    if (!oValidation.valid) {
                        throw new Error("Order #" + iOrderNo + " at item #" + iItemNo + ": " + oValidation.message);
                    }
                }
                return;
            }

            var requiredFields = ["DocType", "Material", "Quantity", "Plant", "SoldToParty"];
            for (var j = 0; j < requiredFields.length; j++) {
                var field = requiredFields[j];
                if (!this._getFirstJSONValue(oValidatedOrder, [field, field.toUpperCase()])) {
                    throw new Error("Order #" + iOrderNo + " missing required field: " + field);
                }
            }
        },

        _toJSONPreviewRow: function (oOrder, iIndex) {
            var mJsonDefaults = this._getJSONDefaults();
            var fnFormatDateForDisplay = function (vValue) {
                return DateUtils.formatDisplayDate(vValue) || String(vValue || "").trim();
            };

            if (this._isDispatcherOrderFormat(oOrder)) {
                var aItems = this._getDispatcherItems(oOrder);
                var oFirstItem = aItems[0] || {};
                var aPreviewItems = aItems.map(function (oItem, iItemIndex) {
                    var it = oItem || {};
                    var sItemNo = String(
                        it.ITEM_NO || it.ItemNo || it.itemNo || String((iItemIndex + 1) * 10).padStart(6, "0")
                    ).trim();

                    return {
                        index: iItemIndex + 1,
                        itemNo: sItemNo,
                        material: String(it.MATERIAL || it.Material || "").trim(),
                        quantity: Number(it.QUANTITY || it.Quantity || 0) || 0,
                        unit: String(it.UNIT || it.Unit || "EA").trim() || "EA",
                        plant: String(it.PLANT || it.Plant || mJsonDefaults.PLANT || "").trim(),
                        storLoc: String(it.STOR_LOC || it.StorLoc || mJsonDefaults.STOR_LOC || "").trim(),
                        deliveryDate: fnFormatDateForDisplay(it.DELIVERY_DATE || it.DeliveryDate || "")
                    };
                });

                if (!aPreviewItems.length) {
                    aPreviewItems.push({
                        index: 1,
                        itemNo: "000010",
                        material: String(oOrder.MATERIAL || oOrder.Material || "").trim(),
                        quantity: Number(oOrder.QUANTITY || oOrder.Quantity || 0) || 0,
                        unit: String(oOrder.UNIT || oOrder.Unit || "EA").trim() || "EA",
                        plant: String(oOrder.PLANT || oOrder.Plant || mJsonDefaults.PLANT || "").trim(),
                        storLoc: String(oOrder.STOR_LOC || oOrder.StorLoc || mJsonDefaults.STOR_LOC || "").trim(),
                        deliveryDate: fnFormatDateForDisplay(oOrder.DELIVERY_DATE || oOrder.DeliveryDate || "")
                    });
                }

                var sDocType = oOrder.DOC_TYPE || oOrder.DocType || mJsonDefaults.DOC_TYPE;
                var iDispatcherItemCount = aPreviewItems.length;

                return {
                    index: iIndex + 1,
                    DocType: sDocType,
                    DocTypeDisplay: sDocType + " • " + iDispatcherItemCount + (iDispatcherItemCount > 1 ? " Items" : " Item"),
                    Material: oFirstItem.MATERIAL || oFirstItem.Material || oOrder.MATERIAL || oOrder.Material || "",
                    Quantity: Number(oFirstItem.QUANTITY || oFirstItem.Quantity || oOrder.QUANTITY || oOrder.Quantity || 0),
                    Unit: oFirstItem.UNIT || oFirstItem.Unit || oOrder.UNIT || oOrder.Unit || "EA",
                    Plant: oFirstItem.PLANT || oFirstItem.Plant || oOrder.PLANT || oOrder.Plant || mJsonDefaults.PLANT,
                    DeliveryDate: fnFormatDateForDisplay(oFirstItem.DELIVERY_DATE || oFirstItem.DeliveryDate || oOrder.DELIVERY_DATE || oOrder.DeliveryDate || ""),
                    SoldToParty: oOrder.SOLD_TO || oOrder.SoldToParty || "",
                    SalesOrg: oOrder.SALES_ORG || oOrder.SalesOrg || mJsonDefaults.SALES_ORG,
                    DistrChan: oOrder.DISTR_CHAN || oOrder.DistrChan || oOrder.Channel || mJsonDefaults.DISTR_CHAN,
                    Division: oOrder.DIVISION || oOrder.Division || mJsonDefaults.DIVISION,
                    Pmnttrms: oOrder.PMNTTRMS || oOrder.PaymentTerms || "",
                    Incoterms1: oOrder.INCOTERMS1 || oOrder.Incoterms1 || "",
                    Incoterms2: oOrder.INCOTERMS2 || oOrder.Incoterms2 || "",
                    Currency: oOrder.CURRENCY || oOrder.Currency || "",
                    ShipTo: oOrder.SHIP_TO || oOrder.ShipToParty || "",
                    Payer: oOrder.PAYER || oOrder.Payer || "",
                    BillTo: oOrder.BILL_TO || oOrder.BillToParty || "",
                    ValidFrom: fnFormatDateForDisplay(oOrder.VALID_FROM || oOrder.ValidFrom || ""),
                    ValidTo: fnFormatDateForDisplay(oOrder.VALID_TO || oOrder.ValidTo || ""),
                    PriceDate: fnFormatDateForDisplay(oOrder.PRICE_DATE || oOrder.PriceDate || ""),
                    PurchNoC: oOrder.PURCH_NO_C || oOrder.PurchNoC || oOrder.PO || "",
                    SalesDist: oOrder.SALES_DIST || oOrder.SalesDistrict || "",
                    CustGroup: oOrder.CUST_GROUP || oOrder.CustGroup || "",
                    FlowType: this._inferFlowTypeFromInputOrder(oOrder),
                    ItemCount: iDispatcherItemCount,
                    PreviewItems: aPreviewItems
                };
            } else {
                var oSingleItem = {
                index: 1,
                itemNo: "000010",
                material: String(oOrder.Material || "").trim(),
                quantity: Number(oOrder.Quantity) || 0,
                unit: String(oOrder.Unit || "EA").trim() || "EA",
                plant: String(oOrder.Plant || mJsonDefaults.PLANT || "").trim(),
                storLoc: String(oOrder.StorageLoc || oOrder.StorLoc || mJsonDefaults.STOR_LOC || "").trim(),
                deliveryDate: fnFormatDateForDisplay(oOrder.ReqDate || "")
            };

            var sLegacyDocType = oOrder.DocType || "";

            return {
                index: iIndex + 1,
                DocType: sLegacyDocType,
                DocTypeDisplay: sLegacyDocType + " • 1 Item",
                Material: oOrder.Material || "",
                Quantity: oOrder.Quantity || 0,
                Unit: oOrder.Unit || "EA",
                Plant: oOrder.Plant || "",
                DeliveryDate: fnFormatDateForDisplay(oOrder.ReqDate || ""),
                SoldToParty: oOrder.SoldToParty || "",
                SalesOrg: oOrder.SalesOrg || mJsonDefaults.SALES_ORG,
                DistrChan: oOrder.Channel || mJsonDefaults.DISTR_CHAN,
                Division: oOrder.Division || mJsonDefaults.DIVISION,
                Pmnttrms: oOrder.PaymentTerms || "",
                Incoterms1: oOrder.Incoterms1 || "",
                Incoterms2: oOrder.Incoterms2 || "",
                Currency: oOrder.Currency || "",
                ShipTo: oOrder.ShipToParty || "",
                Payer: oOrder.Payer || "",
                BillTo: oOrder.BillToParty || "",
                ValidFrom: fnFormatDateForDisplay(oOrder.ValidFrom || ""),
                ValidTo: fnFormatDateForDisplay(oOrder.ValidTo || ""),
                PriceDate: fnFormatDateForDisplay(oOrder.PriceDate || ""),
                PurchNoC: oOrder.PurchNoC || oOrder.PO || "",
                SalesDist: oOrder.SalesDistrict || "",
                CustGroup: oOrder.CustGroup || "",
                FlowType: this._inferFlowTypeFromInputOrder(oOrder),
                ItemCount: 1,
                PreviewItems: [oSingleItem]
            };
            }
        },

        _toJSONSendPayload: function (oOrder) {
            var mJsonDefaults = this._getJSONDefaults();

            if (this._isDispatcherOrderFormat(oOrder) || this._jsonInputShape === "Order") {
                return JSON.stringify({ Orders: [oOrder] });
            }

            return JSON.stringify({
                DocType:       oOrder.DocType       || "OR1",
                PO:            oOrder.PO            || "",
                SalesOrg:      oOrder.SalesOrg      || mJsonDefaults.SALES_ORG,
                Channel:       oOrder.Channel       || mJsonDefaults.DISTR_CHAN,
                SalesDistrict: oOrder.SalesDistrict || "",
                Division:      oOrder.Division      || mJsonDefaults.DIVISION,
                Incoterms1:    oOrder.Incoterms1    || "FOR",
                Incoterms2:    oOrder.Incoterms2    || "Miami",
                PaymentTerms:  oOrder.PaymentTerms  || "0001",
                SoldToParty:   String(oOrder.SoldToParty || "1003209"),
                ShipToParty:   String(oOrder.ShipToParty || oOrder.SoldToParty || "1003209"),
                BillToParty:   String(oOrder.BillToParty || oOrder.SoldToParty || "1003209"),
                Payer:         String(oOrder.Payer       || oOrder.SoldToParty || "1003209"),
                Material:      oOrder.Material      || "",
                Quantity:      Number(oOrder.Quantity) || 0,
                Plant:         oOrder.Plant         || mJsonDefaults.PLANT,
                StorageLoc:    oOrder.StorageLoc    || mJsonDefaults.STOR_LOC,
                PriceDate:     this._formatDateForPayload(oOrder.PriceDate || this._todayISODate()),
                TestRun:       oOrder.TestRun       || "",
                ReqDate:       this._formatDateForPayload(oOrder.ReqDate || this._todayISODate()),
                ReqTime:       oOrder.ReqTime       || "12:30:00"
            });
        },

        onValidateJSON: function() {
            var oModel = this.getView().getModel("status");
            var sJSONInput = oModel.getProperty("/jsonInput");
            
            if (!sJSONInput || sJSONInput.trim() === "") {
                oModel.setProperty("/jsonValidationVisible", true);
                oModel.setProperty("/jsonValidationText", "Please enter or paste JSON data.");
                oModel.setProperty("/jsonValidationType", "Warning");
                return;
            }
            
            try {
                var oParse = this._parseJSONInputRobust(sJSONInput);
                var oData = oParse.data;
                var oOrdersPayload = this._getJSONOrdersPayload(oData);

                if (!Array.isArray(oOrdersPayload.orders) || oOrdersPayload.orders.length === 0) {
                    throw new Error("The " + oOrdersPayload.shape + " array must not be empty.");
                }

                if (oOrdersPayload.orders.some(function (oOrder) {
                    if (oOrder === null || oOrder === undefined) {
                        return true;
                    }
                    return typeof oOrder === "object" && !Array.isArray(oOrder) && Object.keys(oOrder).length === 0;
                })) {
                    throw new Error("Empty order detected in " + oOrdersPayload.shape + ". Please complete the required data.");
                }

                var aOrders = this._applyJSONDefaultsToOrders(oOrdersPayload.orders);
                var oNormalizedRoot = Object.assign({}, oData);

                // Xóa keys cũ để tránh duplicate Order/Orders
                delete oNormalizedRoot.Order;
                delete oNormalizedRoot.order;
                delete oNormalizedRoot.orders;

                // Chỉ giữ lại 1 key duy nhất là "Orders"
                oNormalizedRoot.Orders = aOrders;

                for (var i = 0; i < aOrders.length; i++) {
                    this._validateJSONOrder(aOrders[i], i);
                }
                
                // Success - store and preview
                this._parsedJSONOrders = aOrders;
                this._parsedJSONRoot = oNormalizedRoot;
                this._jsonInputShape = oOrdersPayload.shape;

                // Show merged payload so user sees the final JSON that will be sent.
                oModel.setProperty("/jsonInput", JSON.stringify(oNormalizedRoot, null, 2));
                
                oModel.setProperty("/jsonValidationVisible", true);
                oModel.setProperty(
                    "/jsonValidationText",
                    (oParse.usedRepair ? "✓ JSON is valid (auto-fixed common syntax) - " : "✓ JSON is valid - ") +
                    "Found " + aOrders.length + " orders (format: " + oOrdersPayload.shape + ")"
                );
                oModel.setProperty("/jsonValidationType", "Success");
                
                // Create preview data
                var aPreview = aOrders.map(function(order, idx) {
                    return this._toJSONPreviewRow(order, idx);
                }.bind(this));

                var nTotalItems = aPreview.reduce(function (nSum, oRow) {
                    return nSum + (Number(oRow && oRow.ItemCount) || 0);
                }, 0);

                if (nTotalItems <= 0) {
                    nTotalItems = aPreview.length;
                }
                
                oModel.setProperty("/jsonTableData", aPreview);
                oModel.setProperty("/jsonPreviewSummary", aPreview.length + " orders • " + nTotalItems + " items");
                oModel.setProperty("/jsonTableVisible", true);
                oModel.setProperty("/jsonCanExecute", true);
                
                // Update wizard steps
                oModel.setProperty("/step1Done", true);
                oModel.setProperty("/step1Active", false);
                oModel.setProperty("/step2Done", true);
                oModel.setProperty("/step2Active", false);
                oModel.setProperty("/step3Active", true);
                
                MessageToast.show("Validation successful! " + aOrders.length + " orders");
                
            } catch (err) {
                oModel.setProperty("/jsonValidationVisible", true);
                oModel.setProperty("/jsonValidationText", "❌ JSON is invalid: " + err.message);
                oModel.setProperty("/jsonValidationType", "Error");
                oModel.setProperty("/jsonTableVisible", false);
                oModel.setProperty("/jsonPreviewSummary", "Empty");
                oModel.setProperty("/jsonCanExecute", false);
                
                MessageToast.show("Validation failed: " + err.message);
            }
        },

        onUploadJSONFile: function() {
            var that = this;
            var oFileUploader = document.createElement("input");
            oFileUploader.type = "file";
            oFileUploader.accept = ".json,application/json";
            
            oFileUploader.onchange = function(e) {
                var file = e.target.files[0];
                if (!file) return;

                var oModel = that.getView().getModel("status");
                var sName = String(file.name || "").toLowerCase();
                var bIsJson = sName.endsWith(".json");

                if (!bIsJson) {
                    that._resetJSONState();
                    oModel.setProperty("/jsonValidationVisible", true);
                    oModel.setProperty("/jsonValidationType", "Error");
                    oModel.setProperty("/jsonValidationText", "❌ Chỉ chấp nhận file .json");
                    MessageToast.show("Only .json files are accepted");
                    return;
                }

                if (Number(file.size || 0) <= 0) {
                    that._resetJSONState();
                    oModel.setProperty("/jsonValidationVisible", true);
                    oModel.setProperty("/jsonValidationType", "Error");
                    oModel.setProperty("/jsonValidationText", "❌ File JSON rỗng");
                    MessageToast.show("JSON file is empty");
                    return;
                }
                
                var reader = new FileReader();
                reader.onload = function(event) {
                    var sRaw = String((event && event.target && event.target.result) || "");
                    var sText = sRaw.trim();

                    if (!sText) {
                        that._resetJSONState();
                        oModel.setProperty("/jsonValidationVisible", true);
                        oModel.setProperty("/jsonValidationType", "Error");
                        oModel.setProperty("/jsonValidationText", "❌ File JSON rỗng");
                        MessageToast.show("JSON file is empty");
                        return;
                    }

                    try {
                        var oParse = that._parseJSONInputRobust(sText);
                        var oPayload = that._getJSONOrdersPayload(oParse.data);
                        var aOrders = that._applyJSONDefaultsToOrders(oPayload.orders);

                        if (!Array.isArray(aOrders) || !aOrders.length) {
                            throw new Error("The " + oPayload.shape + " array must not be empty.");
                        }

                        for (var i = 0; i < aOrders.length; i++) {
                            that._validateJSONOrder(aOrders[i], i);
                        }

                        oModel.setProperty("/jsonInput", sText);
                        MessageToast.show("Loaded file: " + file.name);
                        that.onValidateJSON();
                    } catch (err) {
                        that._resetJSONState();
                        oModel.setProperty("/jsonValidationVisible", true);
                        oModel.setProperty("/jsonValidationType", "Error");
                        oModel.setProperty("/jsonValidationText", "❌ JSON is invalid: " + err.message);
                        MessageToast.show("JSON upload failed: " + err.message);
                    }
                };
                reader.readAsText(file);
            };
            
            oFileUploader.click();
        },

        onDownloadJSONSample: function() {
            var oModel = this.getView().getModel("status");
            var sCustomFormat = oModel.getProperty("/jsonFormatSample");
            var sampleJSON;

            if (sCustomFormat) {
                try {
                    sampleJSON = JSON.parse(sCustomFormat);
                } catch (e) {
                    // fallback to default
                    sampleJSON = null;
                }
            }

            if (!sampleJSON) {
                // Get default values for auto-fill
                var sSalesOrg = oModel.getProperty("/jsonDefaultSalesOrg") || "ND01";
                var sDistrChan = oModel.getProperty("/jsonDefaultDistrChan") || "DI";
                var sDivision = oModel.getProperty("/jsonDefaultDivision") || "AU";
                var sDocType = oModel.getProperty("/jsonDefaultDocType") || "QT";
                var sValidFrom = oModel.getProperty("/jsonDefaultValidFrom") || this._formatISODate(new Date());
                var sValidTo = oModel.getProperty("/jsonDefaultValidTo") || this._formatISODate(new Date());
                var sPriceDate = oModel.getProperty("/jsonDefaultPriceDate") || this._formatISODate(new Date());
                var sPO = oModel.getProperty("/jsonDefaultPO") || "PO001";
                var sRequesterEmail = oModel.getProperty("/jsonDefaultRequesterEmail") || "user@example.com";
                var sStorageLoc = oModel.getProperty("/jsonDefaultStorLoc") || "TG01";
                
                sampleJSON = {
                    "Orders": [
                        {
                            "SoldToParty": "1000058",
                            "ProcessType": "Order-to-Cash",
                            "SalesOrg": sSalesOrg,
                            "DistrChannel": sDistrChan,
                            "Division": sDivision,
                            "DocType": sDocType,
                            "ValidFrom": sValidFrom,
                            "ValidTo": sValidTo,
                            "PriceDate": sPriceDate,
                            "PO": sPO,
                            "RequesterEmail": sRequesterEmail,
                            "StorageLoc": sStorageLoc,
                            "ItemLine": {
                                "item": [
                                    {
                                        "Material": "EV_MOTOR_01",
                                        "Quantity": "3.000",
                                        "Unit": "EA",
                                        "DeliveryDate": sValidTo
                                    }
                                ]
                            }
                        }
                    ]
                };
            }
            
            var dataStr = JSON.stringify(sampleJSON, null, 2);
            var dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            
            var exportFileDefaultName = 'template.json';
            
            var linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
            
            MessageToast.show("Downloaded JSON template: " + exportFileDefaultName);
        },

        onDownloadCSVTemplate: function() {
            // Template with user-friendly header names
            var aHeaders = [
                "Sold-to-Party", "Material", "Process Type", "Quantity", "Unit", "Delivery Date"
            ];
            
            var sCSVContent = aHeaders.join(",") + "\n";
            
            // Add sample row with auto-calculated delivery date for Order-to-Cash
            var today = new Date();
            var deliveryDate = new Date(today);
            deliveryDate.setDate(deliveryDate.getDate() + 3);
            var deliveryDateStr = this._formatISODate(deliveryDate);
            
            var aSampleRow = [
                "1000058", "WILA_TIRE_01", "Order-to-Cash", "3", "EA", deliveryDateStr
            ];
            sCSVContent += aSampleRow.join(",") + "\n";
            
            var dataUri = 'data:text/csv;charset=utf-8,' + encodeURIComponent(sCSVContent);
            var linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', 'template.csv');
            linkElement.click();
            
            MessageToast.show("CSV template downloaded");
        },

        onDownloadExcelTemplate: function() {
            // Template with user-friendly header names
            var aHeaders = [
                "Sold-to-Party", "Material", "Process Type", "Quantity", "Unit", "Delivery Date"
            ];

            // Create sample data with auto-calculated delivery date for Order-to-Cash
            var today = new Date();
            var deliveryDate = new Date(today);
            deliveryDate.setDate(deliveryDate.getDate() + 3);
            var deliveryDateStr = this._formatISODate(deliveryDate);

            var aData = [
                ["1000058", "WILA_TIRE_01", "Order-to-Cash", "3", "EA", deliveryDateStr],
                ["", "", "", "", "", ""],
                ["", "", "", "", "", ""],
                ["", "", "", "", "", ""]
            ];

            // eslint-disable-next-line no-undef
            var ws = XLSX.utils.aoa_to_sheet([aHeaders].concat(aData));

            // Set column widths
            ws['!cols'] = [
                { wch: 15 },  // Sold-to-Party
                { wch: 20 },  // Material
                { wch: 18 },  // Process Type
                { wch: 10 },  // Quantity
                { wch: 8 },   // Unit
                { wch: 15 }   // Delivery Date
            ];

            // Add data validation for Process Type column (C2:C100)
            // eslint-disable-next-line no-undef
            ws['!data'] = [
                {
                    range: 'C2:C100',
                    type: 'list',
                    formula1: '"Order-to-Cash,Make-to-Order"',
                    allowBlank: true,
                    showDropDown: true
                }
            ];

            // Style header row
            var headerStyle = {
                font: { bold: true, color: { rgb: "FFFFFF" } },
                fill: { fgColor: { rgb: "4472C4" }, patternType: "solid" },
                alignment: { horizontal: "center", vertical: "center" }
            };

            for (var i = 0; i < aHeaders.length; i++) {
                var cellRef = String.fromCharCode(65 + i) + '1';  // A1, B1, C1...
                if (!ws[cellRef]) ws[cellRef] = {};
                ws[cellRef].s = headerStyle;
            }

            // eslint-disable-next-line no-undef
            var wb = XLSX.utils.book_new();
            // eslint-disable-next-line no-undef
            XLSX.utils.book_append_sheet(wb, ws, "Template");
            // eslint-disable-next-line no-undef
            XLSX.writeFile(wb, "template.xlsx");

            MessageToast.show("Excel template with Process Type dropdown downloaded");
        },

        onClearJSON: function() {
            this._resetJSONState();
            MessageToast.show("Đã xóa dữ liệu JSON");
        },

        onOpenJSONItemsDialog: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("status");
            if (!oContext) {
                return;
            }

            var oRow = oContext.getObject() || {};
            var aItems = Array.isArray(oRow.PreviewItems) ? oRow.PreviewItems : [];

            if (!aItems.length) {
                MessageToast.show("Không có danh sách Items để hiển thị");
                return;
            }

            var aDialogItems = aItems.map(function (oItem, iIndex) {
                return Object.assign({ index: iIndex + 1 }, oItem || {});
            });

            var oDialogModel = new JSONModel({ items: aDialogItems });
            var oTable = new Table({
                width: "100%",
                fixedLayout: false,
                sticky: ["ColumnHeaders"],
                columns: [
                    new Column({ width: "3rem", hAlign: "Center", header: new Text({ text: "#" }) }),
                    new Column({ width: "8rem", header: new Text({ text: "Item No" }) }),
                    new Column({ width: "16rem", header: new Text({ text: "Material" }) }),
                    new Column({ width: "7rem", hAlign: "End", header: new Text({ text: "Qty" }) }),
                    new Column({ width: "6rem", header: new Text({ text: "Unit" }) }),
                    new Column({ width: "7rem", header: new Text({ text: "Plant" }) }),
                    new Column({ width: "8rem", header: new Text({ text: "Stor Loc" }) }),
                    new Column({ width: "10rem", header: new Text({ text: "Delivery Date" }) })
                ]
            });

            oTable.setModel(oDialogModel, "dlg");
            oTable.bindItems({
                path: "dlg>/items",
                template: new ColumnListItem({
                    cells: [
                        new Text({ text: "{dlg>index}" }),
                        new Text({ text: "{dlg>itemNo}" }),
                        new Text({ text: "{dlg>material}" }),
                        new ObjectNumber({ number: "{dlg>quantity}", emphasized: false }),
                        new Text({ text: "{dlg>unit}" }),
                        new Text({ text: "{dlg>plant}" }),
                        new Text({ text: "{dlg>storLoc}" }),
                        new Text({ text: "{dlg>deliveryDate}" })
                    ]
                })
            });

            var sOrderTitle = "Order #" + String(oRow.index || "?");
            var sTitle = sOrderTitle + " - " + aDialogItems.length + (aDialogItems.length > 1 ? " Items" : " Item");

            var oDialog = new Dialog({
                title: sTitle,
                contentWidth: "64rem",
                contentHeight: "30rem",
                draggable: true,
                resizable: true,
                content: [oTable],
                endButton: new Button({
                    text: "Đóng",
                    press: function () {
                        oDialog.close();
                    }
                }),
                afterClose: function () {
                    oDialog.destroy();
                }
            });

            oDialog.open();
        },

        onSendJSONToCPI: function() {
            if (!this._parsedJSONOrders || this._parsedJSONOrders.length === 0) {
                return MessageToast.show("Vui lòng validate JSON trước!");
            }

            var that = this;
            var nOrders = this._parsedJSONOrders.length;
            var nProcOrders = this._parsedJSONOrders.filter(function (oOrder) {
                var sHint = String(
                    (oOrder && (oOrder.flowType || oOrder.FlowType || oOrder.processType || oOrder.ProcessType || oOrder.path || oOrder.Path || ""))
                ).toUpperCase();
                return sHint.indexOf("PROCUREMENT") !== -1 || sHint.indexOf("MTO") !== -1 || sHint.indexOf("PURCHASE") !== -1;
            }).length;
            var nSalesOrders = Math.max(0, nOrders - nProcOrders);

            MessageBox.confirm(
                "You are about to submit " + nOrders + " order(s) to SAP CPI.\n\n" +
                "The system will automatically route based on FlowType:\n" +
                "  • Sales Flow: Sales Order → Outbound Delivery → Billing\n" +
                "  • Procurement Flow: Sales Order → PR → Approval → PO\n\n" +
                "Current payload overview: " + nSalesOrders + " Sales / " + nProcOrders + " Procurement\n\n" +
                "Do you want to continue?",
                {
                    title: "Confirm JSON Submission",
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            that._sendJSONToCPI();
                        }
                    }
                }
            );
        },

        _sendJSONToCPI: function() {
            var that = this;

            // Always send JSON as one batch payload to preserve the exact REQ/order list.
            this._sendDispatcherBatchJSONToCPI();
            return;

            if (this._jsonInputShape === "Order" && this._parsedJSONRoot && Array.isArray(this._parsedJSONRoot.Order)) {
                this._sendDispatcherBatchJSONToCPI();
                return;
            }

            this._beginResultSession();

            this._cpiCancelled = false;
            var oCurrentRequest = null;
            var bDialogClosed = false;

            var safeClose = function() {
                if (!bDialogClosed) {
                    bDialogClosed = true;
                    try { oBusy.close(); } catch (e) { /* ignore */ }
                }
            };

            var oBusy = new BusyDialog({
                title: "Processing SAP CPI (JSON Mode)",
                text: "Initializing CPI connection...",
                showCancelButton: true,
                cancelButtonText: "Cancel",
                close: function (oEvent) {
                    bDialogClosed = true;
                    if (oEvent.getParameter("cancelPressed")) {
                        that._cpiCancelled = true;
                        if (oCurrentRequest && oCurrentRequest.abort) {
                            try { oCurrentRequest.abort(); } catch (e) { /* ignore */ }
                        }
                    }
                }
            });
            oBusy.open();

            var orders = this._parsedJSONOrders;
            var results = [];
            var successCount = 0;
            var failCount = 0;
            var pendingCount = 0;
            var soCount = 0;
            var dlCount = 0;
            var blCount = 0;

            // Safety net: force-close BusyDialog after max wait time
            var nSafetyTimeout = Math.max(130000, orders.length * 130000);
            var safetyTimer = setTimeout(function() {
                console.error("[CPI-JSON] SAFETY TIMEOUT: force-closing BusyDialog after " + (nSafetyTimeout/1000) + "s");
                safeClose();
                if (results.length > 0) {
                    that._showResults(results, successCount, failCount, pendingCount, soCount, dlCount, blCount);
                } else {
                    MessageBox.error("CPI response timeout. Please check the results in SAP.");
                }
            }, nSafetyTimeout);

            // Process orders sequentially
            var processOrder = function (index) {
                try {
                    if (that._cpiCancelled) {
                        clearTimeout(safetyTimer);
                        safeClose();
                        MessageToast.show("Cancelled processing after " + index + "/" + orders.length + " orders");
                        if (results.length > 0) {
                            that._showResults(results, successCount, failCount, pendingCount, soCount, dlCount, blCount);
                        }
                        return;
                    }
                    if (index >= orders.length) {
                        // ALL DONE
                        clearTimeout(safetyTimer);
                        safeClose();
                        console.log("[CPI-JSON] ALL DONE: " + successCount + " success, " + failCount + " fail");
                        that._showResults(results, successCount, failCount, pendingCount, soCount, dlCount, blCount);
                        
                        // Clear uploaded JSON data after successful send
                        that._resetJSONState();
                        return;
                    }

                    var order = orders[index];
                    var oMeta = that._toJSONPreviewRow(order, index);
                    oBusy.setText(
                        "Đang xử lý order " + (index + 1) + " / " + orders.length + "\n" +
                        "Material: " + (oMeta.Material || "N/A") + "\n" +
                        "Phân luồng Sales/Procurement theo FlowType"
                    );

                    var payload = that._toJSONSendPayload(order);

                    console.log("[CPI-JSON] Sending order " + (index + 1) + "/" + orders.length + " to backend...");

                    var oController;
                    try {
                        oController = that._fetchWithTimeoutAndCsrf(that._buildProcurementServiceUrl("sendToCPI"), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ payload: payload })
                        }, 120000);
                        oCurrentRequest = oController;
                    } catch (e) {
                        console.error("[CPI-JSON] fetch init error:", e);
                        failCount++;
                        results.push({
                            rowIndex: index + 1,
                            material: oMeta.Material || "N/A",
                            quantity: Number(oMeta.Quantity) || 0,
                            docType: oMeta.DocType || "OR1",
                            salesOrder: "", delivery: "", billing: "",
                            batchId: "",
                            flowStage: "Khởi tạo request",
                            docStatus: "Error", docStatusText: "Lỗi kết nối",
                            message: e.message || "Không thể khởi tạo request",
                            timestamp: ""
                        });
                        processOrder(index + 1);
                        return;
                    }

                    oController.promise
                    .then(function (response) {
                        oCurrentRequest = null;
                        console.log("[CPI-JSON] Response status:", response.status, response.statusText);
                        if (!response.ok) {
                            // Read error body for details
                            return response.text().then(function(body) {
                                console.error("[CPI-JSON] Error response body:", body);
                                var errMsg = "HTTP " + response.status;
                                try { errMsg = JSON.parse(body).error.message; } catch(e) { /* use status */ }
                                throw new Error(errMsg);
                            });
                        }
                        return that._readJsonResponseSafely(response, "[CPI-JSON]");
                    })
                    .then(function (oResult) {
                        console.log("[CPI-JSON] Parsed result:", JSON.stringify(oResult));
                        // Handle CAP OData error format
                        if (oResult && oResult.error) {
                            throw new Error(oResult.error.message || "CPI error");
                        }
                        // OData V4 might wrap result in 'value'
                        var data = oResult;
                        if (oResult && oResult.value && typeof oResult.value === "object") {
                            data = oResult.value;
                        }

                        var dataForRow = data;
                        if (data && typeof data.responsePayload === "string" && data.responsePayload.trim()) {
                            try {
                                dataForRow = JSON.parse(data.responsePayload);
                            } catch (e) {
                                dataForRow = data;
                            }
                        }

                        var oRowResult = that._buildResultRow(dataForRow, {
                            rowIndex: index + 1,
                            material: oMeta.Material || "N/A",
                            quantity: Number(oMeta.Quantity) || 0,
                            docType: oMeta.DocType || "OR1"
                        });

                        if (oRowResult.docStatus === "Success") {
                            successCount++;
                        } else if (that._isRowPendingLike(oRowResult)) {
                            pendingCount++;
                        } else {
                            failCount++;
                        }

                        if (oRowResult.salesOrder) { soCount++; }
                        if (oRowResult.delivery) { dlCount++; }
                        if (oRowResult.billing) { blCount++; }

                        results.push(oRowResult);

                        processOrder(index + 1);
                    })
                    .catch(function (err) {
                        oCurrentRequest = null;
                        console.error("[CPI-JSON] Catch error for order " + (index+1) + ":", err);
                        failCount++;
                        results.push({
                            rowIndex: index + 1,
                            material: oMeta.Material || "N/A",
                            quantity: Number(oMeta.Quantity) || 0,
                            docType: oMeta.DocType || "OR1",
                            salesOrder: "", delivery: "", billing: "",
                            batchId: "",
                            flowStage: "Initialize request",
                            docStatus: "Error",
                            docStatusText: "Failed",
                            message: that._cpiCancelled ? "Cancelled by user" : (err.message || "Unknown error"),
                            timestamp: ""
                        });

                        processOrder(index + 1);
                    });

                } catch (unexpectedErr) {
                    // Nuclear safety: if ANYTHING throws synchronously, close dialog
                    console.error("[CPI-JSON] UNEXPECTED ERROR in processOrder:", unexpectedErr);
                    clearTimeout(safetyTimer);
                    safeClose();
                    MessageBox.error("Unexpected error: " + (unexpectedErr.message || unexpectedErr));
                }
            };

            // Start processing
            processOrder(0);
        },

        _sendDispatcherBatchJSONToCPI: function () {
            var that = this;
            this._beginResultSession();
            this._cpiCancelled = false;
            var oCurrentRequest = null;

            var oBusy = new BusyDialog({
                title: "Sending JSON Batch to SAP CPI",
                text: "Sending entire Order payload...",
                showCancelButton: true,
                cancelButtonText: "Cancel",
                close: function (oEvent) {
                    if (oEvent.getParameter("cancelPressed")) {
                        that._cpiCancelled = true;
                        if (oCurrentRequest && oCurrentRequest.abort) {
                            try { oCurrentRequest.abort(); } catch (e) { /* ignore */ }
                        }
                    }
                }
            });
            oBusy.open();

            var oPayloadRoot = (this._parsedJSONRoot && typeof this._parsedJSONRoot === "object")
                ? Object.assign({}, this._parsedJSONRoot)
                : {};

            if (Array.isArray(oPayloadRoot.orders) && !Array.isArray(oPayloadRoot.Order)) {
                oPayloadRoot.Order = oPayloadRoot.orders;
            }

            if (!Array.isArray(oPayloadRoot.Order)) {
                oPayloadRoot.Order = Array.isArray(this._parsedJSONOrders) ? this._parsedJSONOrders : [];
            }

            var aInputOrders = oPayloadRoot.Order;
            var sPayload = JSON.stringify(oPayloadRoot);

            oCurrentRequest = this._fetchWithTimeoutAndCsrf(this._buildProcurementServiceUrl("sendToCPIAsync"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ payload: sPayload })
            }, 90000);

            oCurrentRequest.promise
            .then(function (response) {
                if (!response.ok) {
                    return response.text().then(function (body) {
                        var errMsg = "HTTP " + response.status;
                        try { errMsg = JSON.parse(body).error.message; } catch (e) { /* use status */ }
                        throw new Error(errMsg);
                    });
                }
                var sBatchIdFromHeaders = that._extractBatchIdFromResponseHeaders(response);
                return that._readJsonResponseSafely(response, "[CPI-BATCH]").then(function (oResult) {
                    return {
                        result: oResult,
                        batchIdFromHeaders: sBatchIdFromHeaders
                    };
                });
            })
            .then(function (oParsed) {
                var oResult = oParsed && oParsed.result ? oParsed.result : {};
                var data = (oResult && oResult.value && typeof oResult.value === "object") ? oResult.value : oResult;
                var dataForRows = data;

                if (data && typeof data.responsePayload === "string" && data.responsePayload.trim()) {
                    try {
                        dataForRows = JSON.parse(data.responsePayload);
                    } catch (e) {
                        dataForRows = data;
                    }
                }

                var aRows = that._buildBatchRowsFromDispatcherResponse(
                    aInputOrders,
                    dataForRows,
                    (data && data.batchId) || (oParsed && oParsed.batchIdFromHeaders)
                );
                if (!aRows.length) {
                    aRows = that._buildBatchPendingRows(
                        aInputOrders,
                        dataForRows,
                        (data && data.batchId) || (oParsed && oParsed.batchIdFromHeaders)
                    );
                }

                var sBatchForToast = aRows[0] && aRows[0].batchId ? aRows[0].batchId : "";
                var aBusinessRows = aRows.filter(function (oRow) {
                    return !!oRow && !oRow.isQuotationParent;
                });
                if (!aBusinessRows.length) {
                    aBusinessRows = aRows;
                }

                var successCount = aBusinessRows.filter(function (oRow) { return oRow.docStatus === "Success"; }).length;
                var pendingCount = aBusinessRows.filter(function (oRow) { return that._isRowPendingLike(oRow); }).length;
                var failCount = aBusinessRows.filter(function (oRow) { return oRow.docStatus === "Error"; }).length;
                var soCount = aBusinessRows.filter(function (oRow) { return !!String(oRow.salesOrder || "").trim(); }).length;
                var dlCount = aBusinessRows.filter(function (oRow) { return !!String(oRow.delivery || "").trim(); }).length;
                var blCount = aBusinessRows.filter(function (oRow) { return !!String(oRow.billing || "").trim(); }).length;

                that._showResults(aRows, successCount, failCount, pendingCount, soCount, dlCount, blCount);
                MessageToast.show("Order has been sent successfully");
            })
            .catch(function (err) {
                if (that._cpiCancelled) {
                    MessageToast.show("Cancelled sending JSON batch");
                    return;
                }
                var sErrMsg = err && err.message ? err.message : "Unknown error";
                if (sErrMsg.toLowerCase().indexOf("timeout") !== -1) {
                    sErrMsg += "\n\nThe system has not received a response from CAP within the timeout period. Please check your network connection/app router before concluding CPI error.";
                }
                MessageBox.error("Failed to send JSON batch: " + sErrMsg);
            })
            .finally(function () {
                try { oBusy.close(); } catch (e) { /* ignore */ }
            });
        },

        _sendExcelBatchToCPI: function () {
            var that = this;
            var aInputOrders = Array.isArray(this._parsedExcelOrders) ? this._parsedExcelOrders : [];

            // Nếu là CSV raw, không cần check orders
            if (!this._isCSVFile || !this._lastRawCSVContent) {
                if (!aInputOrders.length) {
                    MessageToast.show("No valid orders to send to CPI");
                    return;
                }
            }

            this._beginResultSession();
            this._cpiCancelled = false;
            var oCurrentRequest = null;

            var oBusy = new BusyDialog({
                title: "Sending CSV/Excel to SAP CPI",
                text: "Sending Order payload via dispatcher standard...",
                showCancelButton: true,
                cancelButtonText: "Cancel",
                close: function (oEvent) {
                    if (oEvent.getParameter("cancelPressed")) {
                        that._cpiCancelled = true;
                        if (oCurrentRequest && oCurrentRequest.abort) {
                            try { oCurrentRequest.abort(); } catch (e) { /* ignore */ }
                        }
                    }
                }
            });
            oBusy.open();

            // DEBUG: Log giá trị để kiểm tra
            console.log("DEBUG _sendExcelBatchToCPI:");
            console.log("  _isCSVFile:", this._isCSVFile);
            console.log("  _lastRawCSVContent length:", this._lastRawCSVContent ? this._lastRawCSVContent.length : 0);
            console.log("  _lastUploadedFileName:", this._lastUploadedFileName);

            // Khôi phục từ localStorage nếu bị mất khi navigate
            var bIsCSV = this._isCSVFile;
            var sRawCSV = this._lastRawCSVContent;
            var sFileName = this._lastUploadedFileName;

            if (bIsCSV === undefined || bIsCSV === null) {
                var sStoredIsCSV = localStorage.getItem("_lastIsCSVFile");
                bIsCSV = (sStoredIsCSV === "true");
                console.log("  -> Restored _isCSVFile from localStorage:", bIsCSV);
            }

            if (!sRawCSV && bIsCSV) {
                sRawCSV = localStorage.getItem("_lastRawCSVContent");
                console.log("  -> Restored _lastRawCSVContent from localStorage, length:", sRawCSV ? sRawCSV.length : 0);
            }

            if (!sFileName) {
                sFileName = localStorage.getItem("_lastUploadedFileName") || "";
            }

            // Nếu là file CSV, gửi raw CSV content thay vì JSON
            var sPayload;
            var sPayloadType;
            var sFileType;
            var sUploadType;
            if (bIsCSV && sRawCSV) {
                sPayload = sRawCSV;
                sPayloadType = "text/csv";
                sFileType = "CSV";
                sUploadType = "CSV";
                console.log("  -> Sending RAW CSV");
                MessageToast.show("SENDING RAW CSV - Length: " + sRawCSV.length);
            } else {
                // Excel hoặc không có raw content - gửi JSON format
                var oPayloadRoot = { Order: aInputOrders };
                sPayload = JSON.stringify(oPayloadRoot);
                sPayloadType = "application/json";
                sFileType = "Excel";
                sUploadType = "Excel";
                console.log("  -> Sending JSON (isCSV:", bIsCSV, ", hasRaw:", !!sRawCSV, ")");
                MessageToast.show("SENDING JSON - isCSV: " + bIsCSV + ", hasRaw: " + !!sRawCSV);
            }

            oCurrentRequest = this._fetchWithTimeoutAndCsrf(this._buildProcurementServiceUrl("sendToCPIAsync"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-Upload-Type": sUploadType,
                    "X-File-Type": sFileType
                },
                body: JSON.stringify({
                    payload: sPayload,
                    uploadType: sUploadType,
                    fileType: sFileType,
                    payloadType: sPayloadType,
                    fileName: sFileName || ""
                })
            }, 90000);

            oCurrentRequest.promise
            .then(function (response) {
                if (!response.ok) {
                    return response.text().then(function (body) {
                        var errMsg = "HTTP " + response.status;
                        try { errMsg = JSON.parse(body).error.message; } catch (e) { /* use status */ }
                        throw new Error(errMsg);
                    });
                }

                var sBatchIdFromHeaders = that._extractBatchIdFromResponseHeaders(response);
                return that._readJsonResponseSafely(response, "[CPI-CSV-BATCH]").then(function (oResult) {
                    return {
                        result: oResult,
                        batchIdFromHeaders: sBatchIdFromHeaders
                    };
                });
            })
            .then(function (oParsed) {
                var oResult = oParsed && oParsed.result ? oParsed.result : {};
                var data = (oResult && oResult.value && typeof oResult.value === "object") ? oResult.value : oResult;
                var dataForRows = data;

                if (data && typeof data.responsePayload === "string" && data.responsePayload.trim()) {
                    try {
                        dataForRows = JSON.parse(data.responsePayload);
                    } catch (e) {
                        dataForRows = data;
                    }
                }

                var sBatchRef = (data && data.batchId) || (oParsed && oParsed.batchIdFromHeaders) || "";
                var aRows = that._buildBatchRowsFromDispatcherResponse(aInputOrders, dataForRows, sBatchRef);

                if (!aRows.length) {
                    aRows = that._buildBatchPendingRows(aInputOrders, dataForRows, sBatchRef);
                }

                var sBatchForToast = aRows[0] && aRows[0].batchId ? aRows[0].batchId : "";
                var aBusinessRows = aRows.filter(function (oRow) {
                    return !!oRow && !oRow.isQuotationParent;
                });
                if (!aBusinessRows.length) {
                    aBusinessRows = aRows;
                }

                var successCount = aBusinessRows.filter(function (oRow) { return oRow.docStatus === "Success"; }).length;
                var pendingCount = aBusinessRows.filter(function (oRow) { return that._isRowPendingLike(oRow); }).length;
                var failCount = aBusinessRows.filter(function (oRow) { return oRow.docStatus === "Error"; }).length;
                var soCount = aBusinessRows.filter(function (oRow) { return !!String(oRow.salesOrder || "").trim(); }).length;
                var dlCount = aBusinessRows.filter(function (oRow) { return !!String(oRow.delivery || "").trim(); }).length;
                var blCount = aBusinessRows.filter(function (oRow) { return !!String(oRow.billing || "").trim(); }).length;

                that._showResults(aRows, successCount, failCount, pendingCount, soCount, dlCount, blCount);
                MessageToast.show("Order has been sent successfully");
                
                // Clear uploaded file after successful send
                that._resetState();
            })
            .catch(function (err) {
                if (that._cpiCancelled) {
                    MessageToast.show("Cancelled sending CSV/Excel batch");
                    return;
                }
                var sErrMsg = err && err.message ? err.message : "Unknown error";
                if (sErrMsg.toLowerCase().indexOf("timeout") !== -1) {
                    sErrMsg += "\n\nThe system has not received a response from CAP within the timeout period. Please check your network connection/app router before concluding CPI error.";
                }
                MessageBox.error("Failed to send CSV/Excel batch: " + sErrMsg);
            })
            .finally(function () {
                try { oBusy.close(); } catch (e) { /* ignore */ }
            });
        },

        /* ══════════════════════════════════════
           5. CONFIRM & SEND TO CPI
           ══════════════════════════════════════ */
        onThcHinNhXChinLcButtonPress: function () {
            var oStatusModel = this.getView().getModel("status");
            var aRows = oStatusModel.getProperty("/tableData") || [];
            if (!Array.isArray(aRows) || aRows.length === 0) {
                return MessageToast.show("Vui lòng tải lên file CSV/Excel trước!");
            }

            this._refreshCSVPreviewValidation();
            if (!oStatusModel.getProperty("/canExecute")) {
                var sReason = oStatusModel.getProperty("/csvValidationText") || "File chưa hợp lệ!";
                return MessageBox.error("Data is not valid for SAP CPI:\n" + sReason);
            }

            // DEBUG: Check CSV detection
            console.log("DEBUG onThcHinNhXChinLcButtonPress:");
            console.log("  _isCSVFile (instance):", this._isCSVFile);
            console.log("  _lastRawCSVContent length (instance):", this._lastRawCSVContent ? this._lastRawCSVContent.length : 0);
            
            // Fallback: Read from model if instance variables are lost
            var bIsCSVFromModel = oStatusModel.getProperty("/_isCSVFile");
            var sRawCSVFromModel = oStatusModel.getProperty("/_lastRawCSVContent");
            console.log("  _isCSVFile (from model):", bIsCSVFromModel);
            console.log("  _lastRawCSVContent length (from model):", sRawCSVFromModel ? sRawCSVFromModel.length : 0);
            
            // Use instance var or model
            var bIsCSV = this._isCSVFile !== undefined ? this._isCSVFile : bIsCSVFromModel;
            var sRawCSV = this._lastRawCSVContent || sRawCSVFromModel;
            
            // If CSV file, send raw CSV content
            if (bIsCSV && sRawCSV) {
                this._parsedExcelRows = aRows;
                this._parsedExcelOrders = null; // No order conversion when sending CSV
                
                // Set instance variables for _sendExcelBatchToCPI
                this._isCSVFile = true;
                this._lastRawCSVContent = sRawCSV;

                var that = this;
                var nRows = aRows.length;

                MessageBox.confirm(
                    "You are about to send " + nRows + " CSV record(s) to SAP CPI.\n\n" +
                    "The system will monitor the progress immediately after submission.\n\n" +
                    "Do you want to continue?",
                    {
                        title: "Confirm CSV Submission",
                        emphasizedAction: MessageBox.Action.OK,
                        onClose: function (sAction) {
                            if (sAction === MessageBox.Action.OK) {
                                that._sendExcelBatchToCPI();
                            }
                        }
                    }
                );
                return;
            }

            // Excel or no raw CSV - convert to orders as usual
            this._parsedExcelRows = aRows;
            this._parsedExcelOrders = this._buildDispatcherOrdersFromCSVRows(aRows);

            var that = this;
            var nRows = aRows.length;
            var nOrders = Array.isArray(this._parsedExcelOrders) ? this._parsedExcelOrders.length : 0;

            MessageBox.confirm(
                "You are about to send " + nRows + " CSV/Excel record(s) (consolidated into " + nOrders + " order(s)) to SAP CPI.\n\n" +
                "The system will monitor the progress immediately after submission.\n\n" +
                "Do you want to continue?",
                {
                    title: "Confirm Submission",
                    emphasizedAction: MessageBox.Action.OK,
                    onClose: function (sAction) {
                        if (sAction === MessageBox.Action.OK) {
                            that._sendToCPI();
                        }
                    }
                }
            );
        },

        /* ══════════════════════════════════════
           6. SEND TO CPI — sequential processing
           ══════════════════════════════════════ */
        _sendToCPI: function () {
            if (Array.isArray(this._parsedExcelOrders) && this._parsedExcelOrders.length) {
                this._sendExcelBatchToCPI();
                return;
            }

            var that = this;
            this._beginResultSession();
            this._cpiCancelled = false;
            var oCurrentRequest = null;
            var bDialogClosed = false;

            var safeClose = function() {
                if (!bDialogClosed) {
                    bDialogClosed = true;
                    try { oBusy.close(); } catch (e) { /* ignore */ }
                }
            };

            var oBusy = new BusyDialog({
                title: "Processing SAP CPI",
                text: "Initializing CPI connection...",
                showCancelButton: true,
                cancelButtonText: "Cancel",
                close: function (oEvent) {
                    bDialogClosed = true;
                    if (oEvent.getParameter("cancelPressed")) {
                        that._cpiCancelled = true;
                        if (oCurrentRequest && oCurrentRequest.abort) {
                            try { oCurrentRequest.abort(); } catch (e) { /* ignore */ }
                        }
                    }
                }
            });
            oBusy.open();

            var rows = this._parsedExcelRows;
            var results = [];
            var successCount = 0;
            var failCount = 0;
            var pendingCount = 0;
            var soCount = 0;
            var dlCount = 0;
            var blCount = 0;

            // Safety net: force-close BusyDialog after max wait time
            var nSafetyTimeout = Math.max(130000, rows.length * 130000);
            var safetyTimer = setTimeout(function() {
                console.error("[CPI-Excel] SAFETY TIMEOUT: force-closing BusyDialog");
                safeClose();
                if (results.length > 0) {
                    that._showResults(results, successCount, failCount, pendingCount, soCount, dlCount, blCount);
                } else {
                    MessageBox.error("CPI response timeout. Please check the results in SAP.");
                }
            }, nSafetyTimeout);

            // Process rows sequentially
            var processRow = function (index) {
                try {
                    if (that._cpiCancelled) {
                        clearTimeout(safetyTimer);
                        safeClose();
                        MessageToast.show("Cancelled processing after " + index + "/" + rows.length + " rows");
                        if (results.length > 0) {
                            that._showResults(results, successCount, failCount, pendingCount, soCount, dlCount, blCount);
                        }
                        return;
                    }
                    if (index >= rows.length) {
                        clearTimeout(safetyTimer);
                        safeClose();
                        console.log("[CPI-Excel] ALL DONE: " + successCount + " success, " + failCount + " fail");
                        that._showResults(results, successCount, failCount, pendingCount, soCount, dlCount, blCount);
                        return;
                    }

                    var row = rows[index];
                    oBusy.setText(
                        "Đang xử lý dòng " + (index + 1) + " / " + rows.length + "\n" +
                        "Vật tư: " + (row.Material || "N/A") + "\n" +
                        "Sales Order → Delivery → Billing"
                    );

                    var payload = JSON.stringify({
                        DocType:       row.DocType       || "OR1",
                        PO:            row.PO            || "",
                        SalesOrg:      row.SalesOrg      || "FU24",
                        Channel:       row.Channel       || "FU",
                        SalesDistrict: row.SalesDistrict || "",
                        Division:      row.Division      || "FH",
                        Incoterms1:    row.Incoterms1    || "FOB",
                        Incoterms2:    row.Incoterms2    || "Miami",
                        PaymentTerms:  row.PaymentTerms  || "0001",
                        SoldToParty:   String(row.SoldToParty || "1003209"),
                        ShipToParty:   String(row.ShipToParty || "1003209"),
                        BillToParty:   String(row.BillToParty || "1003209"),
                        Payer:         String(row.Payer       || "1003209"),
                        Material:      row.Material      || "HEADPHONE_LG",
                        Quantity:      Number(row.Quantity) || 10,
                        Plant:         row.Plant         || "FU24",
                        StorageLoc:    row.StorageLoc    || "TG01",
                        PriceDate:     that._formatDateForPayload(row.PriceDate || that._todayISODate()),
                        TestRun:       row.TestRun       || "",
                        ReqDate:       that._formatDateForPayload(row.ReqDate || that._todayISODate()),
                        ReqTime:       row.ReqTime       || "12:30:00"
                    });

                    console.log("[CPI-Excel] Sending row " + (index + 1) + "/" + rows.length + " to backend...");

                    var oController;
                    try {
                        oController = that._fetchWithTimeoutAndCsrf(that._buildProcurementServiceUrl("sendToCPI"), {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ payload: payload })
                        }, 120000);
                        oCurrentRequest = oController;
                    } catch (e) {
                        console.error("[CPI-Excel] fetch init error:", e);
                        failCount++;
                        results.push({
                            rowIndex: index + 1,
                            material: row.Material || "N/A",
                            quantity: Number(row.Quantity) || 0,
                            docType: row.DocType || "OR1",
                            salesOrder: "", delivery: "", billing: "",
                            batchId: "",
                            flowStage: "Khởi tạo request",
                            docStatus: "Error", docStatusText: "Lỗi kết nối",
                            message: e.message || "Không thể khởi tạo request",
                            timestamp: ""
                        });
                        processRow(index + 1);
                        return;
                    }

                    oController.promise
                    .then(function (response) {
                        oCurrentRequest = null;
                        console.log("[CPI-Excel] Response status:", response.status, response.statusText);
                        if (!response.ok) {
                            return response.text().then(function(body) {
                                console.error("[CPI-Excel] Error response body:", body);
                                var errMsg = "HTTP " + response.status;
                                try { errMsg = JSON.parse(body).error.message; } catch(e) { /* use status */ }
                                throw new Error(errMsg);
                            });
                        }
                        return that._readJsonResponseSafely(response, "[CPI-Excel]");
                    })
                    .then(function (oResult) {
                        console.log("[CPI-Excel] Parsed result:", JSON.stringify(oResult));
                        if (oResult && oResult.error) {
                            throw new Error(oResult.error.message || "CPI error");
                        }
                        var data = oResult;
                        if (oResult && oResult.value && typeof oResult.value === "object") {
                            data = oResult.value;
                        }

                        var dataForRow = data;
                        if (data && typeof data.responsePayload === "string" && data.responsePayload.trim()) {
                            try {
                                dataForRow = JSON.parse(data.responsePayload);
                            } catch (e) {
                                dataForRow = data;
                            }
                        }

                        var oRowResult = that._buildResultRow(dataForRow, {
                            rowIndex: index + 1,
                            material: row.Material || "N/A",
                            quantity: Number(row.Quantity) || 0,
                            docType: row.DocType || "OR1"
                        });

                        if (oRowResult.docStatus === "Success") {
                            successCount++;
                        } else if (that._isRowPendingLike(oRowResult)) {
                            pendingCount++;
                        } else {
                            failCount++;
                        }

                        if (oRowResult.salesOrder) { soCount++; }
                        if (oRowResult.delivery) { dlCount++; }
                        if (oRowResult.billing) { blCount++; }

                        results.push(oRowResult);

                        processRow(index + 1);
                    })
                    .catch(function (err) {
                        oCurrentRequest = null;
                        console.error("[CPI-Excel] Catch error for row " + (index+1) + ":", err);
                        failCount++;
                        results.push({
                            rowIndex: index + 1,
                            material: row.Material || "N/A",
                            quantity: Number(row.Quantity) || 0,
                            docType: row.DocType || "OR1",
                            salesOrder: "", delivery: "", billing: "",
                            batchId: "",
                            flowStage: "Initialize request",
                            docStatus: "Error",
                            docStatusText: "Failed",
                            message: that._cpiCancelled ? "Cancelled by user" : (err.message || "Unknown error"),
                            timestamp: ""
                        });

                        processRow(index + 1);
                    });

                } catch (unexpectedErr) {
                    console.error("[CPI-Excel] UNEXPECTED ERROR in processRow:", unexpectedErr);
                    clearTimeout(safetyTimer);
                    safeClose();
                    MessageBox.error("Unexpected error: " + (unexpectedErr.message || unexpectedErr));
                }
            };

            // Start processing
            processRow(0);
        },

        _safeDocNumber: function (v) {
            var s = String(v || "").trim();
            return (s && s !== "N/A") ? s : "";
        },

        _extractBatchId: function (oData) {
            var data = oData || {};
            var aCandidates = [
                data.Batch_ID,
                data.batchId,
                data.batchID,
                data.SAP_MessageProcessingLogID,
                data.sapMessageProcessingLogId,
                data.messageProcessingLogId,
                data.CorrelationId,
                data.correlationId
            ];

            for (var i = 0; i < aCandidates.length; i++) {
                var sValue = String(aCandidates[i] || "").trim();
                if (sValue && sValue !== "N/A") {
                    return sValue;
                }
            }

            var sMessage = String(data.message || data.Message || "");
            var aGuidMatch = sMessage.match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/);
            if (aGuidMatch && aGuidMatch[0]) {
                return aGuidMatch[0];
            }

            return "";
        },

        _isPendingState: function (oData) {
            var sStatus = String((oData && oData.status) || "").toUpperCase();
            var sStatusCode = String((oData && (oData.statusCode || oData.StatusCode)) || "").toUpperCase();
            var sMessage = String((oData && (oData.message || oData.Message)) || "").toLowerCase();

            if (sStatus.indexOf("PENDING") !== -1 || sStatus.indexOf("WAIT") !== -1 || sStatus.indexOf("PROCESS") !== -1 || sStatus.indexOf("QUEUE") !== -1 || sStatus.indexOf("APPROVAL") !== -1 || sStatus.indexOf("IN_PROGRESS") !== -1) {
                return true;
            }

            if (sStatusCode.indexOf("PENDING") !== -1 || sStatusCode.indexOf("PROCESS") !== -1 || sStatusCode.indexOf("RUNNING") !== -1 || sStatusCode.indexOf("WAIT") !== -1 || sStatusCode.indexOf("QUEUE") !== -1) {
                return true;
            }

            return sMessage.indexOf("chờ phê duyệt") !== -1 ||
                sMessage.indexOf("cho phe duyet") !== -1 ||
                sMessage.indexOf("approval") !== -1 ||
                sMessage.indexOf("đang xử lý") !== -1 ||
                sMessage.indexOf("dang xu ly") !== -1;
        },

        _isWarehouseProcessingState: function (oData, bHasDelivery, bHasBilling) {
            var data = oData || {};
            var sWarehouseWorkflowStatus = String(
                data.warehouseWorkflowStatus || data.warehouseStatus || ""
            ).toUpperCase();
            var sWarehouseMessage = String(
                data.warehouseMessage || data.warehouseStatusText || data.deliveryMessage || ""
            ).toLowerCase();
            var bWarehouseCalled = String(data.warehouseCalled || "").toLowerCase() === "true";

            if (sWarehouseWorkflowStatus) {
                if (
                    sWarehouseWorkflowStatus.indexOf("RUNNING") !== -1 ||
                    sWarehouseWorkflowStatus.indexOf("PROCESS") !== -1 ||
                    sWarehouseWorkflowStatus.indexOf("PENDING") !== -1 ||
                    sWarehouseWorkflowStatus.indexOf("QUEUED") !== -1 ||
                    sWarehouseWorkflowStatus.indexOf("STARTED") !== -1
                ) {
                    return true;
                }
            }

            if (sWarehouseMessage.indexOf("warehouse") !== -1) {
                if (
                    sWarehouseMessage.indexOf("đã gửi") !== -1 ||
                    sWarehouseMessage.indexOf("da gui") !== -1 ||
                    sWarehouseMessage.indexOf("đang xử lý") !== -1 ||
                    sWarehouseMessage.indexOf("dang xu ly") !== -1 ||
                    sWarehouseMessage.indexOf("picking") !== -1
                ) {
                    return true;
                }
            }

            if (!bHasBilling && bHasDelivery && bWarehouseCalled) {
                return true;
            }

            return false;
        },

        _extractDispatcherResultItems: function (oPayload) {
            var data = oPayload || {};

            if (data && typeof data === "object" && data.value && typeof data.value === "object") {
                data = data.value;
            }

            if (Array.isArray(data)) {
                return data;
            }

            if (data && typeof data === "object") {
                if (data.EtResults && typeof data.EtResults === "object") {
                    if (Array.isArray(data.EtResults.item)) {
                        return data.EtResults.item;
                    }
                    if (data.EtResults.item && typeof data.EtResults.item === "object") {
                        return [data.EtResults.item];
                    }
                }

                if (data.etResults && typeof data.etResults === "object") {
                    if (Array.isArray(data.etResults.item)) {
                        return data.etResults.item;
                    }
                    if (data.etResults.item && typeof data.etResults.item === "object") {
                        return [data.etResults.item];
                    }
                }

                var fnMapEtReturn = function (oEtReturn) {
                    if (!oEtReturn || typeof oEtReturn !== "object") {
                        return [];
                    }

                    var aReturns = [];
                    if (Array.isArray(oEtReturn.item)) {
                        aReturns = oEtReturn.item;
                    } else if (oEtReturn.item && typeof oEtReturn.item === "object") {
                        aReturns = [oEtReturn.item];
                    }

                    return aReturns
                        .map(function (oRet) {
                            var sItems = String((oRet && (oRet.Items || oRet.items)) || "").trim();
                            if (!sItems || sItems.toUpperCase() === "SUMMARY") {
                                return null;
                            }
                            return {
                                quotationNo: sItems,
                                QuotationNo: sItems,
                                Status: oRet && (oRet.MsgType || oRet.msgType),
                                Message: oRet && (oRet.MsgDesc || oRet.msgDesc || oRet.Message || oRet.message)
                            };
                        })
                        .filter(function (oRet) {
                            return !!oRet;
                        });
                };

                var aEtReturnItems = fnMapEtReturn(data.EtReturn);
                if (!aEtReturnItems.length) {
                    aEtReturnItems = fnMapEtReturn(data.etReturn);
                }
                if (aEtReturnItems.length) {
                    return aEtReturnItems;
                }

                if (Array.isArray(data.responses)) {
                    return data.responses;
                }
                if (data.responses && typeof data.responses === "object") {
                    if (Array.isArray(data.responses.item)) {
                        return data.responses.item;
                    }
                    if (data.responses.item && typeof data.responses.item === "object") {
                        return [data.responses.item];
                    }
                    if (Array.isArray(data.responses.root)) {
                        return data.responses.root;
                    }
                    if (data.responses.root && typeof data.responses.root === "object") {
                        return [data.responses.root];
                    }
                }

                if (Array.isArray(data.item)) {
                    return data.item;
                }
                if (data.item && typeof data.item === "object") {
                    return [data.item];
                }
                if (Array.isArray(data.root)) {
                    return data.root;
                }
                if (data.root && typeof data.root === "object") {
                    return [data.root];
                }

                if (
                    data.salesOrder || data.SalesOrder || data.soNumberFromDelivery ||
                    data.delivery || data.deliveryDoc || data.DeliveryDocument ||
                    data.billing || data.BillingDocument ||
                    Array.isArray(data.prs) || Array.isArray(data.pos) ||
                    (data.responses && data.responses.item)
                ) {
                    return [data];
                }
            }

            return [];
        },

        _findInputOrderByQuotation: function (aInputOrders, sQuotationNo, iFallbackIndex) {
            var aOrders = Array.isArray(aInputOrders) ? aInputOrders : [];
            var sQuotation = String(sQuotationNo || "").trim();

            if (sQuotation) {
                var oMatched = aOrders.find(function (oOrder) {
                    var aCandidates = [
                        oOrder && oOrder.QT_REQ_ID,
                        oOrder && oOrder.Quotation,
                        oOrder && oOrder.QUOTATION,
                        oOrder && oOrder.PURCH_NO_C,
                        oOrder && oOrder.PO
                    ];

                    return aCandidates.some(function (v) {
                        return String(v || "").trim() === sQuotation;
                    });
                });

                if (oMatched) {
                    return oMatched;
                }
            }

            return aOrders[iFallbackIndex] || {};
        },

        _extractObjectArray: function (oData, aKeys) {
            var data = oData || {};
            var aCandidates = Array.isArray(aKeys) ? aKeys : [];

            for (var i = 0; i < aCandidates.length; i++) {
                var sKey = aCandidates[i];
                var v = data[sKey];

                if (Array.isArray(v)) {
                    return v;
                }

                if (v && typeof v === "object") {
                    if (Array.isArray(v.item)) {
                        return v.item;
                    }
                    if (v.item && typeof v.item === "object") {
                        return [v.item];
                    }
                }
            }

            return [];
        },

        _pickFirstDocValue: function (oItem, aKeys) {
            if (!oItem || typeof oItem !== "object") {
                return "";
            }

            for (var i = 0; i < aKeys.length; i++) {
                var sValue = String(oItem[aKeys[i]] || "").trim();
                if (sValue) {
                    return sValue;
                }
            }

            return "";
        },

        _buildProcessDocSummary: function (aItems, aKeyCandidates, sPrefix) {
            var aList = Array.isArray(aItems) ? aItems : [];
            if (!aList.length) {
                return "-";
            }

            var aCodes = aList.map(function (oItem) {
                return this._pickFirstDocValue(oItem, aKeyCandidates);
            }.bind(this)).filter(function (sCode) {
                return !!sCode;
            });

            if (!aCodes.length) {
                return aList.length + " " + sPrefix + "s";
            }

            return aCodes.length + " " + sPrefix + "s";
        },

        _resolveFlowType: function (oData, sSalesOrder, sDelivery, sBilling, aPrs, aPos, sBaseFlowType) {
            var data = oData || {};
            var sExplicit = String(
                sBaseFlowType ||
                data.flowType || data.FlowType || data.processType || data.ProcessType ||
                data.currentIFlow || data.currentStage || ""
            ).toUpperCase();

            if (
                sExplicit.indexOf("PROCUREMENT") !== -1 ||
                sExplicit.indexOf("MTO") !== -1 ||
                sExplicit.indexOf("PURCHASE") !== -1 ||
                sExplicit.indexOf("CREATE_PRS") !== -1 ||
                sExplicit.indexOf("CREATE_PO") !== -1 ||
                sExplicit.indexOf("PRS_") !== -1 ||
                sExplicit.indexOf("PO_") !== -1 ||
                (Array.isArray(aPrs) && aPrs.length > 0) ||
                (Array.isArray(aPos) && aPos.length > 0)
            ) {
                return "PROCUREMENT";
            }

            if (sSalesOrder || sDelivery || sBilling) {
                return "SALES";
            }

            return "SALES";
        },

        _inferFlowTypeFromRecord: function (oRecord) {
            var rec = oRecord || {};
            var sHint = String(rec.processType || "").toUpperCase() + " " +
                String(rec.currentStage || "").toUpperCase() + " " +
                String(rec.message || "").toUpperCase();

            if (
                sHint.indexOf("PROCUREMENT") !== -1 ||
                sHint.indexOf("MTO") !== -1 ||
                sHint.indexOf("MAKE-TO-ORDER") !== -1 ||
                sHint.indexOf("PURCH") !== -1 ||
                sHint.indexOf("CREATE_PRS") !== -1 ||
                sHint.indexOf("CREATE_PO") !== -1 ||
                sHint.indexOf("PRS_") !== -1 ||
                sHint.indexOf("PO_") !== -1
            ) {
                return "Make-to-Order";
            }

            return "Order-to-Cash";
        },

        _buildBatchRowsFromDispatcherResponse: function (aInputOrders, oResponseData, sBatchIdFromHeaders) {
            var aItems = this._extractDispatcherResultItems(oResponseData);
            if (!aItems.length) {
                return [];
            }

            var aRows = [];
            var iQuotationIndex = 1;
            var sDefaultBatchId = String(sBatchIdFromHeaders || this._extractBatchId(oResponseData) || "").trim();

            aItems.forEach(function (oItem, iOrderIdx) {
                var oInputOrder = this._findInputOrderByQuotation(aInputOrders, oItem && oItem.quotationNo, iOrderIdx);
                var aOrderItems = this._getDispatcherItems(oInputOrder);
                var sQuotationNo = String(
                    (oItem && (oItem.quotationNo || oItem.QuotationNo)) ||
                    oInputOrder.QT_REQ_ID || oInputOrder.Quotation || oInputOrder.QUOTATION || oInputOrder.PURCH_NO_C || oInputOrder.PO ||
                    "UNKNOWN"
                );

                var nTotalQty = aOrderItems.length
                    ? aOrderItems.reduce(function (nAcc, oOrderItem) {
                        return nAcc + (Number(oOrderItem.QUANTITY || oOrderItem.Quantity || 0) || 0);
                    }, 0)
                    : 0;

                var sBatchId = String((oItem && (oItem.batchId || oItem.Batch_ID)) || sDefaultBatchId || "").trim();
                var sGroupId = ["Q", sBatchId || "NO_BATCH", sQuotationNo, iOrderIdx + 1].join("::");
                var sDocType = oInputOrder.DOC_TYPE || oInputOrder.DocType || "QT";
                var sBaseFlowType = this._inferFlowTypeFromInputOrder(oInputOrder);

                var oParent = this._buildResultRow(oItem, {
                    rowIndex: iQuotationIndex++,
                    material: "Quotation " + sQuotationNo,
                    quantity: nTotalQty,
                    docType: sDocType + " • " + (aOrderItems.length || 1) + " item(s)",
                    batchId: sBatchId,
                    quotationNo: sQuotationNo,
                    flowType: sBaseFlowType,
                    isQuotationParent: true,
                    isChildItem: false,
                    isExpanded: !!this._quotationExpandState[sGroupId],
                    groupId: sGroupId,
                    itemCount: aOrderItems.length || 1
                });

                aRows.push(oParent);

                if (!aOrderItems.length) {
                    aRows.push({
                        rowIndex: "",
                        material: oInputOrder.MATERIAL || oInputOrder.Material || "BATCH_ORDER",
                        quantity: Number(oInputOrder.QUANTITY || oInputOrder.Quantity || 0),
                        docType: String(oInputOrder.ITEM_NO || oInputOrder.ItemNo || "Item") + " • Detail",
                        salesOrder: oParent.salesOrder,
                        delivery: oParent.delivery,
                        billing: oParent.billing,
                        flowType: oParent.flowType,
                        prCount: oParent.prCount,
                        poCount: oParent.poCount,
                        prListText: oParent.prListText,
                        poListText: oParent.poListText,
                        batchId: oParent.batchId,
                        flowStage: oParent.flowStage,
                        docStatus: oParent.docStatus,
                        docStatusText: oParent.docStatusText,
                        message: oParent.message,
                        timestamp: oParent.timestamp,
                        quotationNo: sQuotationNo,
                        itemNo: oInputOrder.ITEM_NO || oInputOrder.ItemNo || "",
                        isQuotationParent: false,
                        isChildItem: true,
                        parentGroupId: sGroupId
                    });
                    return;
                }

                aOrderItems.forEach(function (oOrderItem) {
                    aRows.push({
                        rowIndex: "",
                        material: oOrderItem.MATERIAL || oOrderItem.Material || oInputOrder.MATERIAL || oInputOrder.Material || "BATCH_ORDER",
                        quantity: Number(oOrderItem.QUANTITY || oOrderItem.Quantity || 0),
                        docType: String(oOrderItem.ITEM_NO || oOrderItem.ItemNo || "Item") + " • Detail",
                        salesOrder: oParent.salesOrder,
                        delivery: oParent.delivery,
                        billing: oParent.billing,
                        flowType: oParent.flowType,
                        prCount: oParent.prCount,
                        poCount: oParent.poCount,
                        prListText: oParent.prListText,
                        poListText: oParent.poListText,
                        batchId: oParent.batchId,
                        flowStage: oParent.flowStage,
                        docStatus: oParent.docStatus,
                        docStatusText: oParent.docStatusText,
                        message: oParent.message,
                        timestamp: oParent.timestamp,
                        quotationNo: sQuotationNo,
                        itemNo: oOrderItem.ITEM_NO || oOrderItem.ItemNo || "",
                        isQuotationParent: false,
                        isChildItem: true,
                        parentGroupId: sGroupId,
                        unit: oOrderItem.UNIT || oOrderItem.Unit || "",
                        plant: oOrderItem.PLANT || oOrderItem.Plant || "",
                        storLoc: oOrderItem.STOR_LOC || oOrderItem.StorLoc || "",
                        deliveryDate: oOrderItem.DELIVERY_DATE || oOrderItem.DeliveryDate || ""
                    });
                });
            }.bind(this));

            return aRows;
        },

        _resolveFlowStage: function (oData, sSalesOrder, sDelivery, sBilling, sBatchId) {
            var data = oData || {};
            var sExplicit = String(
                data.currentIFlow || data.currentIflow || data.currentStep ||
                data.stage || data.step || data.iflow || data.currentStage || data.callbackStep || ""
            ).trim();
            var iPoCount = Number(data.poCount || data.posCount || 0) || 0;
            var iExpectedPoCount = Number(
                data.expectedPoCount || data.expectedPOCount || data.totalPoCount || data.targetPoCount || 0
            ) || 0;
            // Check for Procurement-like FlowType (backward compatible)
            var sDataFlowType = String(data.flowType || data.FlowType || "").toUpperCase();
            var bIsProcurementFlow = sDataFlowType === "PROCUREMENT" || sDataFlowType === "MAKE-TO-ORDER" || 
                                     sDataFlowType === "MTO" || sDataFlowType === "MAKETOORDER";
            var bProcurementHint = !!(
                bIsProcurementFlow ||
                data.processType === "SO_PROCUREMENT" ||
                data.ProcessType === "SO_PROCUREMENT" ||
                data.prs || data.pos || data.itPrItems || data.itPoItems || data.ItPrItems || data.ItPoItems ||
                data.currentStage && String(data.currentStage).toUpperCase().indexOf("CREATE_PO") !== -1
            );

            var bHasDelivery = !!String(sDelivery || "").trim();
            var bHasBilling = !!String(sBilling || "").trim();

            if (bProcurementHint) {
                if (iExpectedPoCount > 0 && iPoCount >= iExpectedPoCount) {
                    return "IF_Worker_Create_PO_From_PR_After_Approval: Completed";
                }
                if (iPoCount > 0) {
                    return "IF_Worker_Create_PO_From_PR_After_Approval: In Progress";
                }
                if (sExplicit) {
                    return sExplicit;
                }
                if (sBatchId || sSalesOrder) {
                    return "IF_Worker_Create_PO_From_PR_After_Approval: Submitted";
                }
                return "Main Dispatcher: Submitted";
            }

            if (bHasBilling) {
                return "IF_DCAP_O2C_CreateBillingDocument: Completed";
            }

            if (this._isWarehouseProcessingState(data, bHasDelivery, bHasBilling)) {
                return "Warehouse Picking: In Progress";
            }

            if (bHasDelivery) {
                return "IF_DCAP_O2C_ProcessOutboundDelivery: Completed";
            }

            if (sExplicit) {
                return sExplicit;
            }

            if (sSalesOrder) {
                return "IF_DCAP_O2C_ProcessSalesOrder: Completed";
            }
            if (sBatchId) {
                return "IF_DCAP_O2C_ProcessSalesOrder: Submitted";
            }
            return "Main Dispatcher: Submitted";
        },

        _buildResultRow: function (oData, oBaseRow) {
            var data = oData || {};
            if (data && typeof data === "object" && data.value && typeof data.value === "object") {
                data = data.value;
            }

            var aWrappedItems = this._extractDispatcherResultItems(data);
            if (aWrappedItems.length === 1 && (data.responses || data.root || data.item)) {
                data = aWrappedItems[0];
            }

            var sStatusRaw = String(data.status || data.Status || data.statusCode || data.StatusCode || data.callbackStatus || "").toUpperCase();
            var sMessage = String(
                data.message || data.Message || data.SOmessage || data.soMessage ||
                data.deliveryMessage || data.warehouseMessage || ""
            ).trim();
            var sSalesOrder = this._safeDocNumber(data.salesOrder || data.SalesOrder || data.soNumberFromDelivery || data.SoNumber);
            var sDelivery = this._safeDocNumber(
                data.delivery || data.deliveryDoc || data.DeliveryDocument || data.Delivery || data.deliveryNo || data.DeliveryNo
            );
            var sBilling = this._safeDocNumber(data.billing || data.BillingDocument || data.Billing || data.Invoice);
            var sQuotation = this._safeDocNumber(data.quotation || data.Quotation || data.quotationDoc || data.QuotationDocument);
            if (!sQuotation) {
                sQuotation = this._safeDocNumber((oBaseRow && (oBaseRow.quotation || oBaseRow.quotationNo)) || "");
            }
            var sQuotationNo = this._safeDocNumber(
                data.quotationNo || data.QuotationNo || data.qtReqId || data.QtReqId || data.QT_REQ_ID || data.purchNoC || data.PurchNoC
            ) || String((oBaseRow && oBaseRow.quotationNo) || "").trim();
            if (!sSalesOrder && sQuotation) {
                // Keep compatibility with existing table/model fields that currently surface `salesOrder`.
                sSalesOrder = sQuotation;
            }
            var aQuotationItemsRaw = this._extractObjectArray(data, ["items", "Items", "quotationItems", "QuotationItems", "ItItems", "itItems"]);
            var aQuotationItems = aQuotationItemsRaw.map(function (oItem, idx) {
                var oLine = oItem || {};
                return {
                    index: idx + 1,
                    itemNo: String(oLine.itemNo || oLine.ItemNo || "").trim(),
                    material: String(oLine.material || oLine.Material || "").trim(),
                    matDesc: String(oLine.matDesc || oLine.MatDesc || oLine.materialDescription || oLine.MaterialDescription || "").trim(),
                    quantity: String(oLine.quantity || oLine.Quantity || "").trim(),
                    salesUnit: String(oLine.salesUnit || oLine.SalesUnit || oLine.unit || oLine.Unit || "").trim(),
                    unit: String(oLine.salesUnit || oLine.SalesUnit || oLine.unit || oLine.Unit || "").trim(),
                    netPrice: String(oLine.netPrice || oLine.NetPrice || "").trim(),
                    itemValue: String(oLine.itemValue || oLine.ItemValue || "").trim(),
                    plant: String(oLine.plant || oLine.Plant || "").trim(),
                    storLoc: String(oLine.storLoc || oLine.StorLoc || "").trim(),
                    deliveryDate: String(oLine.deliveryDate || oLine.DeliveryDate || oLine.delivDate || oLine.DelivDate || "").trim(),
                    currency: String(oLine.currency || oLine.Currency || data.currency || data.Currency || "").trim()
                };
            }).filter(function (oLine) {
                return !!(oLine.itemNo || oLine.material);
            });
            var aPrs = this._extractObjectArray(data, ["prs", "prList", "prsList", "purchaseRequisitions", "itPrItems", "ItPrItems"]);
            var aPos = this._extractObjectArray(data, ["pos", "poList", "posList", "purchaseOrders", "itPoItems", "ItPoItems"]);
            var sFlowType = this._resolveFlowType(data, sSalesOrder, sDelivery, sBilling, aPrs, aPos, oBaseRow && oBaseRow.flowType);
            var iPrCount = Number(data.prCount || data.prsCount || aPrs.length || 0) || 0;
            var iPoCount = Number(data.poCount || data.posCount || aPos.length || 0) || 0;
            var iExpectedPoCount = Number(
                data.expectedPoCount || data.expectedPOCount || data.totalPoCount || data.targetPoCount || 0
            ) || 0;
            var sPrListText = this._buildProcessDocSummary(aPrs, ["preqNo", "prNo", "purchaseRequisition", "prNumber"], "PR");
            var sPoListText = this._buildProcessDocSummary(aPos, ["poNo", "purchaseOrder", "ebeln", "poNumber"], "PO");
            var sBatchId = this._extractBatchId(data);
            if (!sBatchId) {
                sBatchId = String((oBaseRow && oBaseRow.batchId) || "").trim();
            }
            var bHasBilling = !!sBilling;
            var bHasProgress = !!(sSalesOrder || sDelivery || sBilling);
            // Check for Procurement-like FlowType (backward compatible)
            var sFlowTypeUpper = String(sFlowType || "").toUpperCase();
            var bProcurementFlow = sFlowTypeUpper === "PROCUREMENT" || sFlowTypeUpper === "MAKE-TO-ORDER" || 
                                   sFlowTypeUpper === "MTO" || sFlowTypeUpper === "MAKETOORDER";
            var bProcurementCompleted = bProcurementFlow && (
                (iExpectedPoCount > 0 && iPoCount >= iExpectedPoCount) ||
                ((sStatusRaw === "SUCCESS" || sStatusRaw === "S" || sStatusRaw.indexOf("COMPLETED") !== -1) && iPoCount > 0 && !this._isPendingState(data))
            );
            var bQuotationCompleted = !bProcurementFlow && (
                data.quotationCompleted === true
                || String(data.quotationCompleted || "").toLowerCase() === "true"
                || ((sStatusRaw === "SUCCESS" || sStatusRaw === "S" || sStatusRaw.indexOf("COMPLETED") !== -1)
                    && !!sQuotation
                    && !this._isPendingState(data))
            );
            var bRejectedOrError = sStatusRaw.indexOf("REJECT") !== -1 || sStatusRaw.indexOf("ERROR") !== -1 || sStatusRaw.indexOf("FAIL") !== -1;
            var bWarehouseProcessing = this._isWarehouseProcessingState(data, !!sDelivery, bHasBilling);
            var sBaseStage = String((oBaseRow && oBaseRow.flowStage) || "").toUpperCase();
            var bSubmittedLikeStage = sBaseStage.indexOf("SUBMITTED") !== -1
                || sBaseStage.indexOf("DISPATCHER") !== -1
                || sBaseStage.indexOf("RUNNING") !== -1
                || sBaseStage.indexOf("PROCESS") !== -1
                || sBaseStage.indexOf("QUEUE") !== -1;
            var bPending = false;

            if (bProcurementFlow) {
                bPending = !bRejectedOrError && !bProcurementCompleted && (
                    this._isPendingState(data) ||
                    sStatusRaw.indexOf("RUNNING") !== -1 ||
                    sStatusRaw.indexOf("PENDING") !== -1 ||
                    sStatusRaw.indexOf("QUEUED") !== -1 ||
                    iPoCount === 0 ||
                    (iExpectedPoCount > 0 && iPoCount < iExpectedPoCount) ||
                    !!sBatchId
                );
            } else {
                bPending = !bRejectedOrError && !bQuotationCompleted && (
                    bWarehouseProcessing ||
                    this._isPendingState(data) ||
                    (sBatchId && !bHasBilling) ||
                    (bHasProgress && !bHasBilling) ||
                    bSubmittedLikeStage
                );
            }

            if (bWarehouseProcessing) {
                var sWarehouseNote = "Warehouse is processing picking";
                if (!sMessage) {
                    sMessage = sWarehouseNote;
                } else if (String(sMessage).toLowerCase().indexOf("warehouse") === -1) {
                    sMessage += " | " + sWarehouseNote;
                }
            }

            if (!sQuotationNo && bRejectedOrError) {
                sQuotationNo = "UNKNOWN";
            }

            var sDocStatus = "Warning";
            var sDocStatusText = "Chờ kết quả";

            if (bRejectedOrError) {
                sDocStatus = "Error";
                sDocStatusText = "Failed";
            } else if (bHasBilling || bProcurementCompleted || bQuotationCompleted) {
                sDocStatus = "Success";
                sDocStatusText = bProcurementFlow
                    ? "All Purchase Orders created"
                    : (bQuotationCompleted ? "Quotation created" : "Completed");
            } else if (bWarehouseProcessing) {
                sDocStatus = "Pending";
                sDocStatusText = "Warehouse is processing picking";
            } else if (bPending) {
                sDocStatus = "Pending";
                sDocStatusText = bProcurementFlow
                    ? (iExpectedPoCount > 0 ? ("Creating PO (" + iPoCount + "/" + iExpectedPoCount + ")") : "Creating PO")
                    : "In Progress";
            }

            return Object.assign({}, oBaseRow || {}, {
                salesOrder: sSalesOrder,
                quotation: sQuotation,
                quotationNo: sQuotationNo,
                delivery: sDelivery,
                billing: sBilling,
                flowType: sFlowType,
                prCount: iPrCount,
                poCount: iPoCount,
                prs: aPrs,
                pos: aPos,
                prListText: sPrListText,
                poListText: sPoListText,
                batchId: sBatchId,
                flowStage: this._resolveFlowStage(data, sSalesOrder, sDelivery, sBilling, sBatchId),
                docStatus: sDocStatus,
                docStatusText: sDocStatusText,
                message: sMessage,
                timestamp: String(data.timestamp || data.Timestamp || ""),
                soldTo: String(data.soldTo || data.SoldTo || "").trim(),
                soldToName: String(data.soldToName || data.SoldToName || "").trim(),
                purchNoC: String(data.purchNoC || data.PurchNoC || "").trim(),
                netValue: String(data.netValue || data.NetValue || "").trim(),
                taxAmount: String(data.taxAmount || data.TaxAmount || "").trim(),
                grossValue: String(data.grossValue || data.GrossValue || "").trim(),
                currency: String(data.currency || data.Currency || "").trim(),
                validFrom: String(data.validFrom || data.ValidFrom || "").trim(),
                validTo: String(data.validTo || data.ValidTo || "").trim(),
                createdBy: String(data.createdBy || data.CreatedBy || "").trim(),
                createdAt: String(data.createdAt || data.CreatedAt || "").trim(),
                quotationItems: aQuotationItems
            });
        },

        /* ══════════════════════════════════════
           7. SHOW RESULTS — render in-page table
           ══════════════════════════════════════ */
        _showResults: function (results, successCount, failCount, pendingCount, soCount, dlCount, blCount, oOptions) {
            var oModel = this.getView().getModel("status");
            var total = this._countResultBusinessRows(results);
            var batchCount = this._extractUniqueDocCodes(results, "batchId").length;
            var bSkipPersist = !!(oOptions && oOptions.skipPersist);
            var bIsRestored = !!(oOptions && oOptions.isRestored);

            var aRows = Array.isArray(results) ? results : [];
            var aBusinessRowsForCounter = aRows.filter(function (oRow) {
                return !!oRow && !oRow.isChildItem;
            });
            if (!aBusinessRowsForCounter.length) {
                aBusinessRowsForCounter = aRows;
            }

            var nDerivedPending = aBusinessRowsForCounter.filter(function (oRow) {
                return this._isRowPendingLike(oRow);
            }.bind(this)).length;
            var nDerivedSuccess = aBusinessRowsForCounter.filter(function (oRow) {
                return String(oRow && oRow.docStatus || "").toUpperCase() === "SUCCESS";
            }).length;
            var nDerivedError = aBusinessRowsForCounter.filter(function (oRow) {
                return String(oRow && oRow.docStatus || "").toUpperCase() === "ERROR";
            }).length;

            successCount = Math.max(Number(successCount || 0), nDerivedSuccess);
            failCount = Math.max(Number(failCount || 0), nDerivedError);
            pendingCount = Math.max(Number(pendingCount || 0), nDerivedPending);

            // Update wizard steps
            oModel.setProperty("/step3Done", true);
            oModel.setProperty("/step3Active", false);
            oModel.setProperty("/step4Done", true);
            oModel.setProperty("/step4Active", false);

            // Banner
            if (failCount === 0 && pendingCount === 0) {
                oModel.setProperty("/resultBannerText",
                    "Tất cả " + total + " dòng đã được xử lý thành công! " +
                    "Đã tạo " + soCount + " Sales Order, " + dlCount + " Delivery và " + blCount + " Billing Document.");
                oModel.setProperty("/resultBannerType", "Success");
            } else if (pendingCount > 0 && failCount === 0) {
                oModel.setProperty("/resultBannerText",
                    "Đã gửi " + total + " dòng thành công. Hiện có " + pendingCount +
                    " dòng đang chờ phê duyệt/đang chạy iFlow theo Batch_ID.");
                oModel.setProperty("/resultBannerType", "Information");
            } else if (successCount > 0 || (pendingCount > 0 && failCount > 0)) {
                oModel.setProperty("/resultBannerText",
                    "Xử lý hoàn tất: " + successCount + " thành công, " + failCount +
                    " thất bại" + (pendingCount > 0 ? (", " + pendingCount + " đang xử lý") : "") + ".");
                oModel.setProperty("/resultBannerType", "Warning");
            } else {
                oModel.setProperty("/resultBannerText",
                    "Tất cả " + total + " dòng đều thất bại. Vui lòng kiểm tra lại dữ liệu."
                );
                oModel.setProperty("/resultBannerType", "Error");
            }

            // Summary numbers
            oModel.setProperty("/resultTotal", String(total));
            oModel.setProperty("/resultPendingCount", String(pendingCount || 0));
            oModel.setProperty("/resultBatchCount", String(batchCount));
            oModel.setProperty("/resultSOCount", String(soCount));
            oModel.setProperty("/resultDLCount", String(dlCount));
            oModel.setProperty("/resultBLCount", String(blCount));

            // Detail data
            this._resultAllData = Array.isArray(results) ? results.slice() : [];
            this._captureActiveResultScope(this._resultAllData);

            // Keep expansion state in sync for quotation parent rows.
            this._resultAllData = this._resultAllData.map(function (oRow) {
                if (oRow && oRow.isQuotationParent && oRow.groupId) {
                    var bExpanded = !!this._quotationExpandState[oRow.groupId];
                    return Object.assign({}, oRow, { isExpanded: bExpanded });
                }
                return oRow;
            }.bind(this));

            oModel.setProperty("/resultAllData", this._resultAllData);
            this._applyResultFilter(oModel.getProperty("/resultFilterQuery"));

            // Timestamp
            var now = new Date();
            oModel.setProperty("/resultTimestamp",
                "Hoàn tất lúc " + DateUtils.formatDisplayDateTime(now));

            // Switch view
            oModel.setProperty("/resultVisible", true);

            // Auto-navigate to Monitor immediately for fresh upload results.
            if (!bIsRestored && this._resultAllData && this._resultAllData.length > 0) {
                this._navigateToProcessingMonitor();
            }

            if ((pendingCount || 0) > 0) {
                this._startResultAutoRefresh();
                // Trigger an immediate refresh once to avoid waiting for the 30s interval.
                setTimeout(function () {
                    this._restoreTrackedResultsFromDB();
                }.bind(this), 1500);
            } else {
                this._stopResultAutoRefresh();
            }

            // Keep the result table viewport stable at top-left after each run.
            setTimeout(function () {
                try {
                    var $viewport = this.getView().$().find(".resultTableViewport");
                    if ($viewport && $viewport.length) {
                        $viewport.scrollTop(0);
                        $viewport.scrollLeft(0);
                    }
                } catch (e) {
                    // Ignore UI sync errors and keep flow non-blocking.
                }
            }.bind(this), 0);

            if (!bSkipPersist) {
                var aSOCodes = this._extractUniqueDocCodes(results, "salesOrder");
                var aDLCodes = this._extractUniqueDocCodes(results, "delivery");
                var aBLCodes = this._extractUniqueDocCodes(results, "billing");

                this._saveUploadHistoryToDB({
                    processType: "SD_OTC",
                    uploadMethod: oModel.getProperty("/uploadMode") === "json" ? "JSON" : "CSV/Excel",
                    totalRows: total,
                    successRows: successCount,
                    failRows: failCount,
                    salesOrders: soCount,
                    deliveries: dlCount,
                    billings: blCount,
                    salesOrderCodes: aSOCodes.join(", "),
                    deliveryCodes: aDLCodes.join(", "),
                    billingCodes: aBLCodes.join(", "),
                    statusText: failCount === 0
                        ? (pendingCount > 0 ? "Đang xử lý" : "Thành công")
                        : (successCount > 0 || pendingCount > 0 ? "Một phần" : "Thất bại"),
                    createdAt: now.toISOString(),
                    createdBy: this.getOwnerComponent().getModel("app")?.getProperty("/userName") || "anonymous"
                }).finally(function () {
                    this._saveProcessingQuotationsToDB(results);
                }.bind(this));
            }
        },

        _extractUniqueDocCodes: function (aResults, sField) {
            var oSeen = {};
            return (aResults || []).reduce(function (aAcc, oRow) {
                var sCode = oRow && oRow[sField] ? String(oRow[sField]).trim() : "";
                if (!sCode || sCode === "N/A") {
                    return aAcc;
                }
                if (!oSeen[sCode]) {
                    oSeen[sCode] = true;
                    aAcc.push(sCode);
                }
                return aAcc;
            }, []);
        },

        _saveUploadHistoryToDB: function (oHistoryPayload) {
            return this._fetchWithTimeoutAndCsrf(this._buildProcurementServiceUrl("UploadHistory"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(oHistoryPayload)
            }, 30000).promise.then(function (response) {
                if (response.ok) {
                    return;
                }
                return response.text().then(function (sBody) {
                    throw new Error(sBody || ("HTTP " + response.status));
                });
            }).catch(function (oError) {
                MessageToast.show("Khong luu duoc lich su DB: " + (oError.message || "Unknown error"));
            });
        },

        _statusCodeFromDocStatus: function (sDocStatus) {
            var sCode = String(sDocStatus || "").toUpperCase();
            if (sCode === "SUCCESS") {
                return "SUCCESS";
            }
            if (sCode === "ERROR") {
                return "ERROR";
            }
            if (sCode === "PENDING") {
                return "PENDING";
            }
            return "RUNNING";
        },

        _buildProcessingRecordId: function (sBatchId, sQuotationNo) {
            var sB = String(sBatchId || "").trim();
            if (sB === "-" || !sB) {
                sB = "NO_BATCH_" + Math.random().toString(36).substring(2, 7);
            }
            var sRaw = String(sB + "__" + (sQuotationNo || "NO_QUOTATION"));
            var sClean = sRaw.replace(/[^a-zA-Z0-9_]/g, "_");
            if (sClean.length > 170) {
                sClean = sClean.substring(0, 170);
            }
            return "QT_" + sClean;
        },

        _buildProcessingQuotationRecords: function (aResults) {
            var aRows = Array.isArray(aResults) ? aResults : [];
            var aParents = aRows.filter(function (oRow) { return !!(oRow && oRow.isQuotationParent); });
            var aTargets = aParents.length
                ? aParents
                : aRows.filter(function (oRow) { return !!oRow && !oRow.isChildItem; });

            if (!aTargets.length) {
                return [];
            }

            var sCreatedBy = this.getOwnerComponent().getModel("app")?.getProperty("/userName") || "anonymous";
            var sNow = new Date().toISOString();

            return aTargets.map(function (oParent, idx) {
                var aChildren = oParent.groupId ? aRows.filter(function (oRow) {
                    return !!oRow && oRow.parentGroupId === oParent.groupId;
                }) : [];

                var aPrs = Array.isArray(oParent.prs) ? oParent.prs : [];
                var aPos = Array.isArray(oParent.pos) ? oParent.pos : [];

                // Check for Procurement-like FlowType (backward compatible)
                var sParentFlowType = String(oParent.flowType || "").toUpperCase();
                var bIsProcurementFlow = sParentFlowType === "PROCUREMENT" || sParentFlowType === "MAKE-TO-ORDER" || 
                                         sParentFlowType === "MTO" || sParentFlowType === "MAKETOORDER";
                
                if (!aPrs.length && bIsProcurementFlow) {
                    aPrs = aChildren.filter(function (oItem) {
                        return !!(oItem && (oItem.preqNo || oItem.prNo || oItem.purchaseRequisition));
                    });
                }

                if (!aPos.length && bIsProcurementFlow) {
                    aPos = aChildren.filter(function (oItem) {
                        return !!(oItem && (oItem.poNo || oItem.purchaseOrder || oItem.ebeln));
                    });
                }

                var nTotalQuantity = aChildren.length
                    ? aChildren.reduce(function (nAcc, oItem) {
                        return nAcc + (Number(oItem.quantity || 0) || 0);
                    }, 0)
                    : (Number(oParent.quantity || 0) || 0);

                var sBatchId = String(oParent.batchId || "");
                var sQuotationNo = String(oParent.quotationNo || oParent.salesOrder || "UNKNOWN");

                var aItemsPayload = aChildren.map(function (oItem) {
                    return {
                        itemNo: oItem.itemNo || "",
                        material: oItem.material || "",
                        quantity: Number(oItem.quantity || 0),
                        unit: oItem.unit || "",
                        plant: oItem.plant || "",
                        storLoc: oItem.storLoc || "",
                        deliveryDate: oItem.deliveryDate || "",
                        preqNo: oItem.preqNo || "",
                        preqItem: oItem.preqItem || "",
                        poNo: oItem.poNo || "",
                        relStatus: oItem.relStatus || ""
                    };
                });

                if (!aItemsPayload.length) {
                    aItemsPayload.push({
                        itemNo: oParent.itemNo || "",
                        material: oParent.material || "",
                        quantity: Number(oParent.quantity || 0),
                        unit: oParent.unit || "",
                        plant: oParent.plant || "",
                        storLoc: oParent.storLoc || "",
                        deliveryDate: oParent.deliveryDate || "",
                        preqNo: "",
                        preqItem: "",
                        poNo: "",
                        relStatus: ""
                    });
                }

                // Check for Procurement-like FlowType (backward compatible)
                var sParentFlowType2 = String(oParent.flowType || "").toUpperCase();
                var bIsProcurementFlow2 = sParentFlowType2 === "PROCUREMENT" || sParentFlowType2 === "MAKE-TO-ORDER" || 
                                          sParentFlowType2 === "MTO" || sParentFlowType2 === "MAKETOORDER";

                return {
                    ID: this._buildProcessingRecordId(sBatchId, sQuotationNo),
                    batchId: sBatchId,
                    quotationNo: sQuotationNo,
                    processType: bIsProcurementFlow2 ? "SO_PROCUREMENT" : "SD_OTC",
                    currentStage: oParent.flowStage || "Main Dispatcher",
                    statusCode: this._statusCodeFromDocStatus(oParent.docStatus),
                    statusText: oParent.docStatusText || "Dang xu ly",
                    salesOrder: oParent.salesOrder || "",
                    delivery: oParent.delivery || "",
                    billing: oParent.billing || "",
                    message: oParent.message || "",
                    totalItems: aChildren.length || Number(oParent.itemCount || 0) || aItemsPayload.length || 1,
                    totalQuantity: Number(nTotalQuantity.toFixed(3)),
                    itemsJson: JSON.stringify({
                        items: aItemsPayload,
                        prs: aPrs,
                        pos: aPos,
                        prCount: aPrs.length,
                        poCount: aPos.length
                    }),
                    createdAt: sNow,
                    updatedAt: sNow,
                    createdBy: sCreatedBy
                };
            }.bind(this));
        },

        _upsertProcessingQuotation: function (oRecord) {
            var sPatchPath = this._buildProcurementServiceUrl("ProcessingQuotations('" + encodeURIComponent(oRecord.ID) + "')");

            return this._fetchWithTimeoutAndCsrf(this._buildProcurementServiceUrl("ProcessingQuotations"), {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(oRecord)
            }, 30000).promise.then(function (response) {
                if (response.ok) {
                    return;
                }

                return response.text().then(function (sBody) {
                    var sErrorText = String(sBody || "").toLowerCase();
                    var bAlreadyExists = response.status === 409
                        || sErrorText.indexOf("already exists") !== -1
                        || sErrorText.indexOf("entity already exists") !== -1;

                    if (!bAlreadyExists) {
                        throw new Error(sBody || ("HTTP " + response.status));
                    }

                    return this._fetchWithTimeoutAndCsrf(sPatchPath, {
                        method: "PATCH",
                        headers: {
                            "Content-Type": "application/json"
                        },
                        body: JSON.stringify(Object.assign({}, oRecord, { updatedAt: new Date().toISOString() }))
                    }, 30000).promise.then(function (patchResponse) {
                        if (!patchResponse.ok) {
                            return patchResponse.text().then(function (sPatchBody) {
                                throw new Error(sPatchBody || ("HTTP " + patchResponse.status));
                            });
                        }
                    });
                }.bind(this));
            }.bind(this));
        },

        _sleepMs: function (nDelayMs) {
            return new Promise(function (resolve) {
                setTimeout(resolve, Math.max(0, Number(nDelayMs) || 0));
            });
        },

        _isRetryablePersistenceError: function (oError) {
            var sError = String((oError && oError.message) || "").toLowerCase();
            return sError.indexOf("timed out") !== -1
                || sError.indexOf("timeout") !== -1
                || sError.indexOf("resource request") !== -1
                || sError.indexOf("pool") !== -1;
        },

        _upsertProcessingQuotationWithRetry: function (oRecord, nMaxRetries) {
            var that = this;
            var nRetries = Math.max(0, Number(nMaxRetries) || 0);
            var nAttempt = 0;

            var fnTry = function () {
                nAttempt++;
                return that._upsertProcessingQuotation(oRecord).catch(function (oError) {
                    if (!that._isRetryablePersistenceError(oError) || nAttempt > nRetries) {
                        throw oError;
                    }

                    var nBackoffMs = 250 * nAttempt;
                    return that._sleepMs(nBackoffMs).then(fnTry);
                });
            };

            return fnTry();
        },

        _saveProcessingQuotationsToDB: function (aResults) {
            var that = this;
            var aRecords = this._buildProcessingQuotationRecords(aResults);
            if (!aRecords.length) {
                return Promise.resolve();
            }

            var aFailed = [];
            var pSequence = Promise.resolve();

            aRecords.forEach(function (oRecord) {
                pSequence = pSequence
                    .then(function () {
                        return that._upsertProcessingQuotationWithRetry(oRecord, 2)
                            .catch(function (oError) {
                                aFailed.push({
                                    id: oRecord.ID,
                                    message: oError && oError.message ? oError.message : "Unknown error"
                                });
                            });
                    })
                    .then(function () {
                        return that._sleepMs(60);
                    });
            });

            return pSequence.then(function () {
                that._loadPendingQuotationCount();
                if (aFailed.length > 0) {
                    MessageToast.show(
                        "Khong luu duoc " + aFailed.length + "/" + aRecords.length +
                        " quotation monitor: " + aFailed[0].message
                    );
                }
            });
        },

        _extractBatchIdFromResponseHeaders: function (response) {
            if (!response || !response.headers || !response.headers.get) {
                return "";
            }

            var aHeaderNames = [
                "batch_id",
                "batch-id",
                "x-batch-id",
                "x-batchid",
                "sap_messageprocessinglogid",
                "sap-messageprocessinglogid",
                "x-sap-messageprocessinglogid",
                "x-correlation-id",
                "x-correlationid",
                "camelcorrelationid"
            ];

            for (var i = 0; i < aHeaderNames.length; i++) {
                var sValue = String(response.headers.get(aHeaderNames[i]) || "").trim();
                if (sValue) {
                    return sValue;
                }
            }

            return "";
        },

        _buildBatchPendingRows: function (aInputOrders, oAckData, sBatchIdFromHeaders) {
            var data = oAckData || {};
            var sBatchId = String(
                data.Batch_ID || data.batchId || data.batchID ||
                data.requestId || data.RequestId ||
                data.SAP_MessageProcessingLogID || data.sapMessageProcessingLogId ||
                sBatchIdFromHeaders || ""
            ).trim();

            if (!sBatchId) {
                sBatchId = this._extractBatchId(data);
            }

            var sMessage = String(data.message || data.Message || "Da tiep nhan payload, CPI dang xu ly");
            var sTimestamp = String(data.timestamp || data.Timestamp || new Date().toISOString());
            var sFlowStage = String(data.currentIFlow || data.currentIflow || data.stage || "Main Dispatcher: Submitted");
            var sAckStatus = String(data.status || data.Status || data.statusCode || data.StatusCode || "").toUpperCase();
            var bAckError = sAckStatus.indexOf("ERROR") !== -1 || sAckStatus.indexOf("FAIL") !== -1 || sAckStatus.indexOf("REJECT") !== -1;
            var bAckSuccess = sAckStatus.indexOf("SUCCESS") !== -1 || sAckStatus.indexOf("COMPLETED") !== -1 || sAckStatus === "S";
            var sDocStatus = bAckError ? "Error" : (bAckSuccess ? "Success" : "Pending");
            var sDocStatusText = bAckError ? "Failed" : (bAckSuccess ? "Processed" : "In Progress");

            if (bAckError) {
                sFlowStage = "IF_DCAP_O2C_ProcessSalesOrder: Failed";
            } else if (bAckSuccess && sFlowStage.indexOf("Completed") === -1 && sFlowStage.indexOf("Failed") === -1) {
                sFlowStage = "IF_DCAP_O2C_ProcessSalesOrder: Completed";
            }

            var aRows = [];
            var iQuotationIndex = 1;

            (aInputOrders || []).forEach(function (oOrder, iOrderIdx) {
                var sDocType = oOrder.DOC_TYPE || oOrder.DocType || "OR1";
                var aItems = this._getDispatcherItems(oOrder);
                var sQuotationNo = String(
                    oOrder.QT_REQ_ID || oOrder.Quotation || oOrder.QUOTATION ||
                    oOrder.PURCH_NO_C || oOrder.PO || "UNKNOWN"
                );
                var sGroupId = ["Q", sBatchId || "NO_BATCH", sQuotationNo, iOrderIdx + 1].join("::");
                var nTotalQty = 0;
                var sFlowType = this._inferFlowTypeFromInputOrder(oOrder);

                if (aItems.length) {
                    nTotalQty = aItems.reduce(function (nAcc, oItem) {
                        return nAcc + (Number(oItem.QUANTITY || oItem.Quantity || 0) || 0);
                    }, 0);
                } else {
                    nTotalQty = Number(oOrder.QUANTITY || oOrder.Quantity || 0) || 0;
                }

                aRows.push({
                    rowIndex: iQuotationIndex++,
                    material: "Quotation " + sQuotationNo,
                    quantity: nTotalQty,
                    docType: sDocType + " • " + (aItems.length || 1) + " item(s)",
                    quotation: sQuotationNo,
                    salesOrder: "",
                    delivery: "",
                    billing: "",
                    flowType: sFlowType,
                    prCount: 0,
                    poCount: 0,
                    prListText: "-",
                    poListText: "-",
                    batchId: sBatchId,
                    flowStage: sFlowStage,
                    docStatus: sDocStatus,
                    docStatusText: sDocStatusText,
                    message: sMessage,
                    timestamp: sTimestamp,
                    quotationNo: sQuotationNo,
                    isQuotationParent: true,
                    isChildItem: false,
                    isExpanded: !!this._quotationExpandState[sGroupId],
                    groupId: sGroupId,
                    itemCount: aItems.length || 1
                });

                if (!aItems.length) {
                    aRows.push({
                        rowIndex: "",
                        material: oOrder.MATERIAL || oOrder.Material || "BATCH_ORDER",
                        quantity: Number(oOrder.QUANTITY || oOrder.Quantity || 0),
                        docType: (oOrder.ITEM_NO || oOrder.ItemNo || "Item") + " • Detail",
                        quotation: sQuotationNo,
                        salesOrder: "",
                        delivery: "",
                        billing: "",
                        flowType: sFlowType,
                        prCount: 0,
                        poCount: 0,
                        prListText: "-",
                        poListText: "-",
                        batchId: sBatchId,
                        flowStage: sFlowStage,
                        docStatus: sDocStatus,
                        docStatusText: sDocStatusText,
                        message: sMessage,
                        timestamp: sTimestamp,
                        quotationNo: sQuotationNo,
                        itemNo: oOrder.ITEM_NO || oOrder.ItemNo || "",
                        isQuotationParent: false,
                        isChildItem: true,
                        parentGroupId: sGroupId
                    });
                    return;
                }

                aItems.forEach(function (oItem) {
                    aRows.push({
                        rowIndex: "",
                        material: oItem.MATERIAL || oItem.Material || oOrder.MATERIAL || oOrder.Material || "BATCH_ORDER",
                        quantity: Number(oItem.QUANTITY || oItem.Quantity || oOrder.QUANTITY || oOrder.Quantity || 0),
                        docType: String(oItem.ITEM_NO || oItem.ItemNo || "Item") + " • Detail",
                        quotation: sQuotationNo,
                        salesOrder: "",
                        delivery: "",
                        billing: "",
                        batchId: sBatchId,
                        flowStage: sFlowStage,
                        docStatus: sDocStatus,
                        docStatusText: sDocStatusText,
                        message: sMessage,
                        timestamp: sTimestamp,
                        quotationNo: sQuotationNo,
                        itemNo: oItem.ITEM_NO || oItem.ItemNo || "",
                        isQuotationParent: false,
                        isChildItem: true,
                        parentGroupId: sGroupId
                    });
                });
            }.bind(this));

            if (!aRows.length) {
                aRows.push({
                    rowIndex: 1,
                    material: "Quotation UNKNOWN",
                    quantity: 0,
                    docType: "QT • 0 item(s)",
                    salesOrder: "",
                    delivery: "",
                    billing: "",
                    batchId: sBatchId,
                    flowStage: sFlowStage,
                    docStatus: sDocStatus,
                    docStatusText: sDocStatusText,
                    message: sMessage,
                    timestamp: sTimestamp,
                    quotationNo: "UNKNOWN",
                    isQuotationParent: true,
                    isChildItem: false,
                    isExpanded: false,
                    groupId: "Q::EMPTY",
                    itemCount: 0
                });
            }

            return aRows;
        },

        _readJsonResponseSafely: function (response, sLogPrefix) {
            var sPrefix = sLogPrefix || "[HTTP]";

            if (!response) {
                return Promise.resolve({});
            }

            // 204 or explicit empty body are valid for some CAP/OData actions.
            var sContentLength = response.headers && response.headers.get
                ? response.headers.get("content-length")
                : null;

            if (response.status === 204 || sContentLength === "0") {
                return Promise.resolve({});
            }

            return response.text().then(function (sBody) {
                var sRaw = String(sBody || "").trim();
                if (!sRaw) {
                    return {};
                }

                try {
                    return JSON.parse(sRaw);
                } catch (e) {
                    console.error(sPrefix + " Invalid JSON response:", sRaw.substring(0, 300));
                    throw new Error("Server returned invalid JSON response");
                }
            });
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

        _extractCsrfTokenFromResponse: function (response) {
            var sToken = response && response.headers ? response.headers.get("x-csrf-token") : "";
            sToken = String(sToken || "").trim();

            if (!sToken || sToken.toLowerCase() === "required") {
                return "";
            }

            return sToken;
        },

        _getCsrfToken: function (bForceRefresh) {
            var that = this;
            if (!bForceRefresh && this._csrfTokenCache) {
                return Promise.resolve(this._csrfTokenCache);
            }

            // Some managed approuters do not return CSRF token on service-root HEAD.
            // Try real entity GET endpoints first, then fallback to root HEAD.
            var aCandidates = [
                { url: this._buildProcurementServiceUrl("UploadHistory?$top=1"), method: "GET" },
                { url: this._buildProcurementServiceUrl("ProcessingQuotations?$top=1"), method: "GET" },
                { url: this._buildProcurementServiceUrl(""), method: "HEAD" }
            ];
            var iCandidate = 0;

            var fnTryNext = function () {
                if (iCandidate >= aCandidates.length) {
                    return Promise.resolve("");
                }

                var oCandidate = aCandidates[iCandidate++];

                return fetch(oCandidate.url, {
                    method: oCandidate.method,
                    headers: {
                        "X-CSRF-Token": "Fetch",
                        "X-Requested-With": "XMLHttpRequest",
                        "Accept": "application/json"
                    },
                    credentials: "include"
                }).then(function (response) {
                    var sToken = that._extractCsrfTokenFromResponse(response);
                    if (sToken) {
                        that._csrfTokenCache = sToken;
                        return sToken;
                    }

                    return fnTryNext();
                }).catch(function () {
                    return fnTryNext();
                });
            };

            return fnTryNext();
        },

        _fetchWithTimeoutAndCsrf: function (url, options, timeoutMs) {
            var that = this;
            var bCancelled = false;
            var oActiveRequest = null;
            var sMethod = String((options && options.method) || "GET").toUpperCase();
            var bNeedsCsrf = ["POST", "PUT", "PATCH", "DELETE"].indexOf(sMethod) !== -1;

            var fnSend = function (sToken, bAllowRetry) {
                if (bCancelled) {
                    throw new Error("Cancelled by user");
                }

                var oHeaders = Object.assign({}, (options && options.headers) || {});
                if (bNeedsCsrf && sToken) {
                    oHeaders["X-CSRF-Token"] = sToken;
                }
                oHeaders["X-Requested-With"] = "XMLHttpRequest";

                var oRequestOptions = Object.assign({}, options || {}, {
                    headers: oHeaders,
                    credentials: "include"
                });

                oActiveRequest = that._fetchWithTimeout(url, oRequestOptions, timeoutMs);
                if (bCancelled && oActiveRequest && oActiveRequest.abort) {
                    oActiveRequest.abort();
                }

                return oActiveRequest.promise.then(function (response) {
                    if (response && response.status === 403 && bAllowRetry && bNeedsCsrf) {
                        var sTokenFrom403 = that._extractCsrfTokenFromResponse(response);
                        if (sTokenFrom403) {
                            that._csrfTokenCache = sTokenFrom403;
                            if (sTokenFrom403 !== sToken) {
                                return fnSend(sTokenFrom403, false);
                            }
                        }

                        that._csrfTokenCache = null;
                        return that._getCsrfToken(true).then(function (sRefreshedToken) {
                            if (!sRefreshedToken || sRefreshedToken === sToken) {
                                return response;
                            }
                            return fnSend(sRefreshedToken, false);
                        });
                    }
                    return response;
                });
            };

            var oTokenPromise = bNeedsCsrf ? this._getCsrfToken(false) : Promise.resolve("");
            var oPromise = oTokenPromise.then(function (sToken) {
                return fnSend(sToken, true);
            });

            return {
                promise: oPromise,
                abort: function () {
                    bCancelled = true;
                    if (oActiveRequest && oActiveRequest.abort) {
                        oActiveRequest.abort();
                    }
                }
            };
        },

        /* ══════════════════════════════════════
           UTILITY: _fetchWithTimeout
           ══════════════════════════════════════ */
        _fetchWithTimeout: function(url, options, timeoutMs) {
            var nTimeout = timeoutMs || 120000;
            var supportsAbort = typeof AbortController !== "undefined";
            var controller = supportsAbort ? new AbortController() : null;
            var requestOptions = Object.assign({}, options || {});
            var bTimedOut = false;
            var bCancelledByUser = false;

            if (controller) {
                requestOptions.signal = controller.signal;
            }

            var timer;
            var timeoutPromise = new Promise(function (_, reject) {
                timer = setTimeout(function () {
                    bTimedOut = true;
                    if (controller) {
                        controller.abort();
                    }
                    reject(new Error("Timeout sau " + Math.round(nTimeout / 1000) + " giây"));
                }, nTimeout);
            });

            var fetchPromise = fetch(url, requestOptions);
            var promise = Promise.race([fetchPromise, timeoutPromise])
                .then(function (response) {
                    clearTimeout(timer);
                    return response;
                })
                .catch(function (err) {
                    clearTimeout(timer);
                    if (err && (err.name === "AbortError" || String(err.message || "").toLowerCase().indexOf("aborted") !== -1)) {
                        if (bTimedOut) {
                            throw new Error("Timeout after " + Math.round(nTimeout / 1000) + " seconds");
                        }
                        if (bCancelledByUser) {
                            throw new Error("Cancelled by user");
                        }
                        throw new Error("Request was cancelled before receiving server response");
                    }
                    throw err;
                });

            return {
                promise: promise,
                abort: function () {
                    bCancelledByUser = true;
                    if (controller) {
                        controller.abort();
                    }
                }
            };
        },

        /* ══════════════════════════════════════
           7. RESET — upload new file
           ══════════════════════════════════════ */
        onResetUpload: function () {
            this._resetState();
        },

        /* ══════════════════════════════════════
           8. EDIT JSON FORMAT
           ══════════════════════════════════════ */
        onEditJSONFormat: function() {
            var that = this;
            var oModel = this.getView().getModel("status");
            var sCurrentFormat = oModel.getProperty("/jsonFormatSample") || JSON.stringify({
                "orders": [
                    {
                        "QT_REQ_ID": "REQ001",
                        "PMNTTRMS": "NT30",
                        "INCOTERMS1": "DAP",
                        "INCOTERMS2": "VINFAST FACTORY HAI PHONG",
                        "CURRENCY": "VND",
                        "SOLD_TO": "1000058",
                        "SHIP_TO": "1000058",
                        "PAYER": "1000058",
                        "BILL_TO": "1000058",
                        "VALID_FROM": "2026-03-17",
                        "VALID_TO": "2026-04-17",
                        "PRICE_DATE": "2026-03-21",
                        "PURCH_NO_C": "VINFAST_EVMOTOR_0001",
                        "SALES_DIST": "",
                        "CUST_GROUP": "",
                        "RequesterEmail": "toanncse182505@fpt.edu.vn",
                        "FlowType": "Make-to-Order",
                        "IT_ITEMS": {
                            "item": [
                                {
                                    "ITEM_NO": "000010",
                                    "MATERIAL": "EV_MOTOR_01",
                                    "QUANTITY": "3.000",
                                    "UNIT": "EA"
                                }
                            ]
                        }
                    }
                ]
            }, null, 2);

            if (this._oFormatDialog) {
                this._oFormatDialog.destroy();
            }

            var oTextArea = new TextArea({
                value: sCurrentFormat,
                rows: 20,
                width: "100%",
                placeholder: "Enter your custom JSON format sample..."
            });
            oTextArea.addStyleClass("jsonFormatEditArea");

            this._oFormatDialog = new Dialog({
                title: "Edit JSON Format",
                contentWidth: "600px",
                draggable: true,
                resizable: true,
                content: [
                    new Label({ text: "Enter your custom JSON structure sample:" }).addStyleClass("sapUiSmallMarginBottom"),
                    oTextArea
                ],
                beginButton: new Button({
                    text: "Save Format",
                    type: "Emphasized",
                    press: function () {
                        var sNewFormat = oTextArea.getValue();
                        try {
                            JSON.parse(sNewFormat);
                            oModel.setProperty("/jsonFormatSample", sNewFormat);
                            MessageToast.show("New JSON format saved!");
                            that._oFormatDialog.close();
                        } catch (e) {
                            MessageBox.error("JSON is invalid: " + e.message);
                        }
                    }
                }),
                endButton: new Button({
                    text: "Cancel",
                    press: function () {
                        that._oFormatDialog.close();
                    }
                }),
                afterClose: function () {
                    that._oFormatDialog.destroy();
                    that._oFormatDialog = null;
                }
            });

            this._oFormatDialog.addStyleClass("sapUiSizeCompact");
            this._oFormatDialog.open();
        },

        onLoadFormatToEditor: function() {
            var oModel = this.getView().getModel("status");
            var sFormat = oModel.getProperty("/jsonFormatSample");
            if (sFormat) {
                oModel.setProperty("/jsonInput", sFormat);
                MessageToast.show("Đã load format JSON vào editor!");
            } else {
                MessageToast.show("Chưa có format nào. Hãy chỉnh sửa format trước.");
            }
        }
    });
});
