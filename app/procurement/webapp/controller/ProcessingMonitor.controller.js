sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "../util/DateUtils"
], function (BaseController, JSONModel, MessageToast, DateUtils) {
    "use strict";

    return BaseController.extend("com.gsp.sap.procurement.ui.poautomationui.controller.ProcessingMonitor", {
        onInit: function () {
            this._expandState = {};
            this._autoRefreshId = null;
            this._allRows = [];
            this._isLoadingData = false;
            this._lastLoadErrorAt = 0;

            var oModel = new JSONModel({
                rows: [],
                filterStatus: "ALL",
                filterBatchId: "",
                batchOptions: [{ key: "", text: "All Batch IDs" }],
                filterSalesOrder: "",
                filterCustomer: "",
                customerOptions: [{ key: "", text: "All Customers" }],
                filterUploadedFrom: "",
                filterUploadedTo: "",
                filterUploadType: "",
                filterDateSort: "DESC",
                activeTab: "ALL",
                totalQuotations: 0,
                runningQuotations: 0,
                completedQuotations: 0,
                failedQuotations: 0,
                batchCount: 0,
                completionRateText: "0%",
                lastUpdatedText: "",
                // New Document Metrics
                totalSalesOrders: 0,
                totalDeliveryDocs: 0,
                totalBillingDocs: 0,
                totalPurchaseReqs: 0,
                totalPurchaseOrders: 0
            });
            this.getView().setModel(oModel, "monitor");

            this.getRouter().getRoute("processingMonitor").attachPatternMatched(this._onRouteMatched, this);
        },

        onExit: function () {
            this._stopAutoRefresh();
        },

        _onRouteMatched: function () {
            this._applyPrefillBatchFilter();
            this._loadData();
            this._startAutoRefresh();
        },

        _startAutoRefresh: function () {
            this._stopAutoRefresh();
            this._autoRefreshId = setInterval(function () {
                this._loadData();
            }.bind(this), 30000);
        },

        _stopAutoRefresh: function () {
            if (this._autoRefreshId) {
                clearInterval(this._autoRefreshId);
                this._autoRefreshId = null;
            }
        },

        _extractBatchIdFromHashQuery: function () {
            try {
                var sHash = String(window && window.location && window.location.hash || "");
                var iQueryIndex = sHash.indexOf("?");
                if (iQueryIndex < 0) {
                    return "";
                }

                var sQuery = sHash.substring(iQueryIndex + 1);
                var oParams = new URLSearchParams(sQuery);
                return String(oParams.get("batchId") || "").trim();
            } catch (e) {
                return "";
            }
        },

        _consumeBatchIdFromSessionStorage: function () {
            var sKey = "po.monitor.prefillBatchId";

            try {
                if (!window) {
                    return "";
                }

                var sBatchId = "";
                if (window.sessionStorage) {
                    sBatchId = String(window.sessionStorage.getItem(sKey) || "").trim();
                    if (sBatchId) {
                        window.sessionStorage.removeItem(sKey);
                        return sBatchId;
                    }
                }

                if (window.localStorage) {
                    sBatchId = String(window.localStorage.getItem(sKey) || "").trim();
                    if (sBatchId) {
                        window.localStorage.removeItem(sKey);
                        return sBatchId;
                    }
                }

                sBatchId = String(window.__poMonitorPrefillBatchId || "").trim();
                if (sBatchId) {
                    window.__poMonitorPrefillBatchId = "";
                }
                return sBatchId;
            } catch (e) {
                return "";
            }
        },

        _applyPrefillBatchFilter: function () {
            var sBatchId = this._consumeBatchIdFromSessionStorage() || this._extractBatchIdFromHashQuery();
            if (!sBatchId) {
                return;
            }

            var oModel = this.getView().getModel("monitor");
            oModel.setProperty("/activeTab", "ALL");
            oModel.setProperty("/filterStatus", "ALL");
            oModel.setProperty("/filterBatchId", sBatchId);
            oModel.setProperty("/filterSalesOrder", "");
            oModel.setProperty("/filterCustomer", "");
            MessageToast.show("Prefilled monitor filter for Batch_ID: " + sBatchId);
        },

        onNavBack: function () {
            this._stopAutoRefresh();
            this.getRouter().navTo("upload");
        },

        onRefresh: function () {
            this._loadData();
            MessageToast.show("Quotation status refreshed");
        },

        onProcessTabSelect: function (oEvent) {
            var sKey = oEvent.getParameter("key");
            this.getView().getModel("monitor").setProperty("/activeTab", sKey);
            this._applyFilter();
        },

        onFilterStatusChange: function (oEvent) {
            var oItem = oEvent.getParameter("item");
            var sKey = oItem && oItem.getKey ? oItem.getKey() : "ALL";
            this.getView().getModel("monitor").setProperty("/filterStatus", sKey);
            this._applyFilter();
        },

        onBatchFilterChange: function (oEvent) {
            var sValue = "";

            if (oEvent && typeof oEvent.getParameter === "function") {
                var oSelectedItem = oEvent.getParameter("selectedItem");
                if (oSelectedItem && typeof oSelectedItem.getKey === "function") {
                    sValue = oSelectedItem.getKey();
                }

                if (!sValue) {
                    sValue = oEvent.getParameter("selectedKey") || oEvent.getParameter("newValue") || "";
                }
            }

            if (!sValue && oEvent && oEvent.getSource && oEvent.getSource().getSelectedKey) {
                sValue = oEvent.getSource().getSelectedKey() || "";
            }

            this.getView().getModel("monitor").setProperty("/filterBatchId", sValue);
            this._applyFilter();
        },

        onSalesOrderFilterChange: function (oEvent) {
            var sValue = oEvent.getParameter("newValue") || "";
            this.getView().getModel("monitor").setProperty("/filterSalesOrder", sValue);
            this._applyFilter();
        },

        onQuotationSearchInput: function (oEvent) {
            var sValue = oEvent.getParameter("newValue") || "";
            this.getView().getModel("monitor").setProperty("/filterSalesOrder", sValue);
        },

        onApplyMonitorFilters: function (oEvent) {
            if (oEvent && oEvent.getParameter && oEvent.getParameter("query") !== undefined) {
                this.getView().getModel("monitor").setProperty("/filterSalesOrder", oEvent.getParameter("query") || "");
            }
            this._applyFilter();
        },

        onCustomerFilterChange: function (oEvent) {
            var sValue = "";
            if (oEvent && typeof oEvent.getParameter === "function") {
                var oSelectedItem = oEvent.getParameter("selectedItem");
                if (oSelectedItem && typeof oSelectedItem.getKey === "function") {
                    sValue = oSelectedItem.getKey();
                }
                if (!sValue) {
                    sValue = oEvent.getParameter("selectedKey") || "";
                }
            }
            if (!sValue && oEvent && oEvent.getSource && oEvent.getSource().getSelectedKey) {
                sValue = oEvent.getSource().getSelectedKey() || "";
            }
            this.getView().getModel("monitor").setProperty("/filterCustomer", sValue);
            this._applyFilter();
        },

        onUploadedDateFilterChange: function () {
            this._applyFilter();
        },

        onUploadTypeFilterChange: function (oEvent) {
            var sValue = "";
            if (oEvent && typeof oEvent.getParameter === "function") {
                var oSelectedItem = oEvent.getParameter("selectedItem");
                if (oSelectedItem && typeof oSelectedItem.getKey === "function") {
                    sValue = oSelectedItem.getKey();
                }
                if (!sValue) {
                    sValue = oEvent.getParameter("selectedKey") || "";
                }
            }
            if (!sValue && oEvent && oEvent.getSource && oEvent.getSource().getSelectedKey) {
                sValue = oEvent.getSource().getSelectedKey() || "";
            }
            this.getView().getModel("monitor").setProperty("/filterUploadType", sValue);
            this._applyFilter();
        },

        onDateSortChange: function (oEvent) {
            var sValue = "DESC";
            if (oEvent && typeof oEvent.getParameter === "function") {
                sValue = oEvent.getParameter("selectedItem") && oEvent.getParameter("selectedItem").getKey
                    ? oEvent.getParameter("selectedItem").getKey()
                    : (oEvent.getParameter("selectedKey") || "DESC");
            }
            this.getView().getModel("monitor").setProperty("/filterDateSort", String(sValue || "DESC").toUpperCase());
            this._applyFilter();
        },

        onClearFilters: function () {
            var oModel = this.getView().getModel("monitor");
            oModel.setProperty("/filterStatus", "ALL");
            oModel.setProperty("/filterBatchId", "");
            oModel.setProperty("/filterSalesOrder", "");
            oModel.setProperty("/filterCustomer", "");
            oModel.setProperty("/filterUploadedFrom", "");
            oModel.setProperty("/filterUploadedTo", "");
            oModel.setProperty("/filterUploadType", "");
            oModel.setProperty("/filterDateSort", "DESC");
            this._applyFilter();
        },

        _formatCustomerDisplay: function (sCustomerId, sCustomerName) {
            var sId = String(sCustomerId || "").trim();
            var sName = String(sCustomerName || "").trim();

            if (sName && sId) {
                return sName + " (" + sId + ")";
            }
            return sName || sId || "";
        },

        _formatMonitorDateTime: function (sValue) {
            var sRaw = String(sValue || "").trim();
            if (!sRaw) {
                return "";
            }

            return DateUtils.formatDisplayDateTime(sRaw) || sRaw;
        },

        _formatMonitorDate: function (sValue) {
            var sRaw = String(sValue || "").trim();
            if (!sRaw) {
                return "";
            }

            return DateUtils.formatDisplayDate(sRaw) || sRaw;
        },

        _toEpoch: function (sValue) {
            return DateUtils.toEpoch(sValue);
        },

        _resolveReasonMessage: function (oRecord) {
            var aCandidates = [
                oRecord && oRecord.errorMessage,
                oRecord && oRecord.errorReason,
                oRecord && oRecord.reason,
                oRecord && oRecord.message,
                oRecord && oRecord.statusText
            ];

            for (var i = 0; i < aCandidates.length; i += 1) {
                var sValue = String(aCandidates[i] == null ? "" : aCandidates[i]).trim();
                if (sValue) {
                    return sValue;
                }
            }

            return "";
        },

        _parseFilterDate: function (sDateValue, bEndOfDay) {
            var sRaw = String(sDateValue || "").trim();
            if (!sRaw) {
                return null;
            }

            var oDate = DateUtils.parseDate(sRaw);
            if (!oDate) {
                return null;
            }

            if (bEndOfDay) {
                oDate.setHours(23, 59, 59, 999);
            }

            return oDate;
        },

        _pickDocField: function (oDoc, aKeys) {
            var oSource = oDoc || {};
            for (var i = 0; i < aKeys.length; i += 1) {
                var sValue = String(oSource[aKeys[i]] == null ? "" : oSource[aKeys[i]]).trim();
                if (sValue) {
                    return sValue;
                }
            }
            return "";
        },

        _toDocNumber: function (vValue) {
            var nValue = Number(vValue);
            return isNaN(nValue) ? 0 : nValue;
        },

        _formatProcDocStatusText: function (sStatusRaw) {
            var sStatus = String(sStatusRaw || "").toUpperCase();
            if (!sStatus) {
                return "In Progress";
            }
            if (sStatus.indexOf("SUCCESS") !== -1 || sStatus.indexOf("COMPLETE") !== -1 || sStatus === "S") {
                return "Completed";
            }
            if (sStatus.indexOf("ERROR") !== -1 || sStatus.indexOf("FAIL") !== -1 || sStatus.indexOf("REJECT") !== -1 || sStatus === "E") {
                return "Failed";
            }
            return "In Progress";
        },

        _formatProcDocStatusState: function (sStatusRaw) {
            var sText = this._formatProcDocStatusText(sStatusRaw);
            if (sText === "Completed") {
                return "Success";
            }
            if (sText === "Failed") {
                return "Error";
            }
            return "Warning";
        },

        _buildQuantityText: function (nQty, sUnit) {
            var nValue = this._toDocNumber(nQty);
            var sSafeUnit = String(sUnit || "").trim();
            if (nValue <= 0 && !sSafeUnit) {
                return "";
            }
            if (nValue <= 0) {
                return sSafeUnit;
            }
            return sSafeUnit ? (nValue + " " + sSafeUnit) : String(nValue);
        },

        _normalizeProcurementDoc: function (oRawDoc) {
            var oDoc = oRawDoc || {};
            var sPoNo = this._pickDocField(oDoc, ["poNo", "poNumber", "purchaseOrder", "ebeln"]);
            var sPoItem = this._pickDocField(oDoc, ["poItem", "itemPo"]);
            var sPrNo = this._pickDocField(oDoc, ["preqNo", "prNo", "purchaseRequisition", "prNumber", "prNoCode"]);
            var sPrItem = this._pickDocField(oDoc, ["preqItem", "prItem"]);
            var sMaterial = this._pickDocField(oDoc, ["material", "matnr"]);
            var sMaterialDesc = this._pickDocField(oDoc, ["materialDesc", "matDesc", "shortText", "materialText"]);
            var sShortText = this._pickDocField(oDoc, ["shortText", "materialText"]);
            var nQuantity = this._toDocNumber(oDoc.quantity || oDoc.qty || oDoc.orderQty || 0);
            var sUnit = this._pickDocField(oDoc, ["unit", "uom", "baseUom"]);
            var sPlant = this._pickDocField(oDoc, ["plant", "werks"]);
            var sPlantDesc = this._pickDocField(oDoc, ["plantDesc"]);
            var sDeliveryDate = this._formatMonitorDate(this._pickDocField(oDoc, ["delivDate", "deliveryDate", "reqDate"]));
            var sVendor = this._pickDocField(oDoc, ["vendor", "lifnr"]);
            var sVendorName = this._pickDocField(oDoc, ["vendorName", "name1"]);
            var sPurchOrg = this._pickDocField(oDoc, ["purchOrg", "ekorg"]);
            var sPurGroup = this._pickDocField(oDoc, ["purGroup", "ekgrp"]);
            var sStatusRaw = this._pickDocField(oDoc, ["status", "statusCode"]);

            var sVendorDisplay = sVendorName && sVendor
                ? (sVendorName + " (" + sVendor + ")")
                : (sVendorName || sVendor || "");
            var sPurchasingDisplay = [sPurchOrg, sPurGroup].filter(Boolean).join(" / ");

            return {
                poNo: sPoNo,
                poItem: sPoItem,
                prNo: sPrNo,
                prItem: sPrItem,
                material: sMaterial,
                materialDesc: sMaterialDesc,
                shortText: sShortText,
                quantity: nQuantity,
                unit: sUnit,
                quantityText: this._buildQuantityText(nQuantity, sUnit),
                plant: sPlant,
                plantDesc: sPlantDesc,
                deliveryDate: sDeliveryDate,
                vendor: sVendor,
                vendorName: sVendorName,
                vendorDisplay: sVendorDisplay,
                purchOrg: sPurchOrg,
                purGroup: sPurGroup,
                purchasingDisplay: sPurchasingDisplay,
                status: sStatusRaw,
                statusText: this._formatProcDocStatusText(sStatusRaw),
                statusState: this._formatProcDocStatusState(sStatusRaw)
            };
        },

        _isProcurementDocValid: function (oDoc, sType) {
            var oRow = oDoc || {};
            if (sType === "PO") {
                return !!oRow.poNo;
            }

            if (!oRow.prNo) {
                return false;
            }

            return !!(
                oRow.prItem ||
                oRow.material ||
                oRow.materialDesc ||
                oRow.shortText ||
                oRow.quantity > 0 ||
                oRow.vendorDisplay ||
                oRow.deliveryDate
            );
        },

        _mergeProcurementDoc: function (oBase, oPatch) {
            var oMerged = Object.assign({}, oBase || {});
            var oIncoming = oPatch || {};

            Object.keys(oIncoming).forEach(function (sField) {
                var vValue = oIncoming[sField];
                if (vValue == null) {
                    return;
                }
                if (typeof vValue === "number") {
                    var nCurrent = this._toDocNumber(oMerged[sField]);
                    if (vValue > 0 || nCurrent <= 0) {
                        oMerged[sField] = vValue;
                    }
                    return;
                }

                var sValue = String(vValue).trim();
                if (sValue && !String(oMerged[sField] == null ? "" : oMerged[sField]).trim()) {
                    oMerged[sField] = sValue;
                }
            }.bind(this));

            oMerged.quantityText = this._buildQuantityText(oMerged.quantity, oMerged.unit);
            oMerged.statusText = this._formatProcDocStatusText(oMerged.status);
            oMerged.statusState = this._formatProcDocStatusState(oMerged.status);
            return oMerged;
        },

        _normalizeProcurementLists: function (aPrs, aPos) {
            var aNormalizedPrs = [];
            var aNormalizedPos = [];
            var mPrIndex = {};
            var mPoIndex = {};

            var fnPush = function (oRawDoc, sHintType) {
                var oDoc = this._normalizeProcurementDoc(oRawDoc);
                var bHasPoNo = !!oDoc.poNo;
                var sType = sHintType || (bHasPoNo ? "PO" : "PR");

                if (bHasPoNo) {
                    sType = "PO";
                }

                if (sType === "PO") {
                    if (!this._isProcurementDocValid(oDoc, "PO")) {
                        return;
                    }

                    var sPoKey = [oDoc.poNo, oDoc.poItem || "00000"].join("|").toUpperCase();
                    if (mPoIndex[sPoKey] === undefined) {
                        mPoIndex[sPoKey] = aNormalizedPos.length;
                        aNormalizedPos.push(oDoc);
                    } else {
                        aNormalizedPos[mPoIndex[sPoKey]] = this._mergeProcurementDoc(aNormalizedPos[mPoIndex[sPoKey]], oDoc);
                    }
                    return;
                }

                if (!this._isProcurementDocValid(oDoc, "PR")) {
                    return;
                }

                var sPrKey = [oDoc.prNo, oDoc.prItem || "00000"].join("|").toUpperCase();
                if (mPrIndex[sPrKey] === undefined) {
                    mPrIndex[sPrKey] = aNormalizedPrs.length;
                    aNormalizedPrs.push(oDoc);
                } else {
                    aNormalizedPrs[mPrIndex[sPrKey]] = this._mergeProcurementDoc(aNormalizedPrs[mPrIndex[sPrKey]], oDoc);
                }
            }.bind(this);

            (aPrs || []).forEach(function (oRawDoc) {
                fnPush(oRawDoc, "PR");
            });

            (aPos || []).forEach(function (oRawDoc) {
                fnPush(oRawDoc, "");
            });

            return {
                prs: aNormalizedPrs,
                pos: aNormalizedPos
            };
        },

        _splitDocumentCodes: function (vCodes) {
            var sRaw = String(vCodes == null ? "" : vCodes).trim();
            if (!sRaw) {
                return [];
            }

            var mSeen = {};
            return sRaw
                .split(/[\s,;|]+/)
                .map(function (sCode) { return String(sCode || "").trim(); })
                .filter(function (sCode) {
                    if (!sCode || /^N\/A$/i.test(sCode) || sCode === "-") {
                        return false;
                    }

                    var sKey = sCode.toUpperCase();
                    if (mSeen[sKey]) {
                        return false;
                    }
                    mSeen[sKey] = true;
                    return true;
                });
        },

        _normalizeLineKeyPart: function (vValue, bNumeric) {
            var sRaw = String(vValue == null ? "" : vValue).trim();
            if (!sRaw) {
                return "";
            }

            if (bNumeric) {
                var nValue = Number(sRaw.replace(/,/g, "."));
                if (!isNaN(nValue)) {
                    return String(nValue);
                }
            }

            if (/^\d+$/.test(sRaw)) {
                return String(parseInt(sRaw, 10));
            }

            return sRaw.toUpperCase();
        },

        _buildBusinessItemKey: function (oItem) {
            var oLine = oItem || {};
            var sDocumentNo = this._normalizeLineKeyPart(
                this._firstFilledValue([oLine.documentNo, oLine.billingDoc, oLine.deliveryDoc, oLine.deliveryNo]),
                true
            );
            var sItemNo = this._normalizeLineKeyPart(oLine.itemNo, true);
            var sMaterial = this._normalizeLineKeyPart(oLine.material, false);
            var sPlant = this._normalizeLineKeyPart(oLine.plant, false);
            var sQuantity = this._normalizeLineKeyPart(oLine.quantity, true);

            if (!(sDocumentNo || sItemNo || sMaterial || sPlant || sQuantity)) {
                return "";
            }

            return [sDocumentNo, sItemNo, sMaterial, sPlant, sQuantity].join("|");
        },

        _mergeNormalizedBusinessItems: function (aItems) {
            var aMerged = [];
            var mIndexByKey = {};

            (aItems || []).forEach(function (oRawItem) {
                if (!oRawItem || typeof oRawItem !== "object") {
                    return;
                }

                var oItem = Object.assign({}, oRawItem);
                var sKey = this._buildBusinessItemKey(oItem);
                if (!sKey) {
                    aMerged.push(oItem);
                    return;
                }

                var nIndex = mIndexByKey[sKey];
                if (nIndex === undefined) {
                    mIndexByKey[sKey] = aMerged.length;
                    aMerged.push(oItem);
                    return;
                }

                var oBase = aMerged[nIndex] || {};
                Object.keys(oItem).forEach(function (sField) {
                    var vIncoming = oItem[sField];
                    if (vIncoming == null) {
                        return;
                    }

                    if (typeof vIncoming === "number") {
                        var nCurrent = Number(oBase[sField]);
                        if (!isNaN(vIncoming) && (isNaN(nCurrent) || nCurrent <= 0)) {
                            oBase[sField] = vIncoming;
                        }
                        return;
                    }

                    var sIncoming = String(vIncoming).trim();
                    if (!sIncoming) {
                        return;
                    }

                    var sCurrent = String(oBase[sField] == null ? "" : oBase[sField]).trim();
                    if (!sCurrent) {
                        oBase[sField] = sIncoming;
                    }
                });

                var nQty = this._toDocNumber(oBase.quantity || 0);
                var sUnit = String(oBase.salesUnit || oBase.unit || "").trim();
                oBase.quantityText = this._buildQuantityText(nQty, sUnit);

                if (!String(oBase.valueText || "").trim()) {
                    oBase.valueText = this._formatAmountWithCurrency(
                        this._firstFilledValue([oBase.itemValue, oBase.netValue, oBase.netPrice]),
                        oBase.currency
                    );
                }

                aMerged[nIndex] = oBase;
            }.bind(this));

            return aMerged;
        },

        _normalizeBusinessItem: function (oRawItem) {
            var oItem = oRawItem || {};
            var sItemNo = this._pickDocField(oItem, [
                "itemNo", "item", "Item", "itemNumber", "lineNo", "line", "lineItem",
                "orderItem", "salesOrderItem", "soItem", "deliveryItem", "billingItem", "position"
            ]);
            var sMaterial = this._pickDocField(oItem, ["material", "matnr", "partNo", "partNumber", "Material"]);
            var sDescription = this._pickDocField(oItem, [
                "description", "desc", "materialDesc", "matDesc", "MatDesc", "shortText", "text", "Description", "MaterialDescription"
            ]);
            var nQuantity = this._toDocNumber(oItem.quantity || oItem.qty || oItem.orderQty || oItem.BilledQty || oItem.billedQty || oItem.Quantity || 0);
            var sUnit = this._pickDocField(oItem, ["unit", "uom", "baseUom", "salesUnit", "Unit", "SalesUnit", "salesUnit"]);
            var sPlant = this._pickDocField(oItem, ["plant", "werks", "Plant"]);
            var sPlantDesc = this._pickDocField(oItem, ["plantDesc", "PlantDesc", "plantDescription", "PlantDescription"]);
            var sStorageLocation = this._pickDocField(oItem, ["storLoc", "storageLocation", "lgort", "StorLoc", "StorageLoc"]);
            var sStorLocDesc = this._pickDocField(oItem, ["storLocDesc", "StorLocDesc", "storageLocationDesc", "StorageLocationDesc"]);
            var sDeliveryDate = this._formatMonitorDate(this._pickDocField(oItem, ["deliveryDate", "delivDate", "reqDate", "billingDate", "BillingDate", "DeliveryDate"]));
            var sNetPrice = this._pickDocField(oItem, ["netPrice", "NetPrice"]);
            var sNetValue = this._pickDocField(oItem, [
                "netValue", "itemValue", "ItemValue", "amount", "total", "lineTotal", "value", "netAmount", "price", "NetValue"
            ]);
            var sCurrency = this._pickDocField(oItem, ["currency", "waers", "Currency"]);
            var sDocumentNo = this._pickDocField(oItem, [
                "documentNo", "DocumentNo", "billingDoc", "BillingDoc", "billingDocument", "BillingDocument", "deliveryDoc", "deliveryNo", "DeliveryNo", "DeliveryDocument", "deliveryDocument", "vbeln"
            ]);
            var sBillingDate = this._formatMonitorDate(this._pickDocField(oItem, ["billingDate", "BillingDate"]));
            var sBillingType = this._pickDocField(oItem, ["billingType", "BillingType", "invoiceType", "InvoiceType"]);
            var sTaxAmount = this._pickDocField(oItem, ["taxAmount", "TaxAmount"]);
            var sGrossValue = this._pickDocField(oItem, ["grossValue", "GrossValue"]);
            var sTotalAmount = this._pickDocField(oItem, ["totalAmount", "TotalAmount"]);
            var sShipPoint = this._pickDocField(oItem, ["shipPoint", "ShipPoint", "shippingPoint", "ShippingPoint"]);
            var sShipPointDesc = this._pickDocField(oItem, ["shipPointDesc", "ShipPointDesc", "shippingPointDesc", "ShippingPointDesc"]);
            var sPickingStatus = this._pickDocField(oItem, [
                "pickingStatus", "PickingStatus", "pickStatus", "PickStatus", "pickingState", "PickingState"
            ]);
            var sPickingDate = this._formatMonitorDate(this._pickDocField(oItem, ["pickingDate", "PickingDate", "pickDate", "PickDate", "pickingAt"]));
            var sPickingBy = this._pickDocField(oItem, ["pickingBy", "PickingBy", "pickBy", "PickBy", "pickingUser", "PickingUser"]);
            var sPgiStatus = this._pickDocField(oItem, [
                "pgiStatus", "PGIStatus", "postGoodsIssueStatus", "PostGoodsIssueStatus", "giStatus", "GIStatus"
            ]);
            var sPgiDate = this._formatMonitorDate(this._pickDocField(oItem, ["pgiDate", "PGIDate", "postGoodsIssueDate", "PostGoodsIssueDate", "giDate"]));
            var sPgiBy = this._pickDocField(oItem, ["pgiBy", "PGIBy", "postGoodsIssueBy", "PostGoodsIssueBy", "giBy"]);
            var sMatDesc = this._pickDocField(oItem, ["matDesc", "MatDesc", "materialDesc", "MaterialDesc"]);

            return {
                documentNo: sDocumentNo,
                itemNo: sItemNo,
                material: sMaterial,
                description: sDescription,
                quantity: nQuantity,
                unit: sUnit,
                quantityText: this._buildQuantityText(nQuantity, sUnit),
                plant: sPlant,
                plantDesc: sPlantDesc,
                storageLocation: sStorageLocation,
                storLocDesc: sStorLocDesc,
                deliveryDate: sDeliveryDate,
                netPrice: sNetPrice,
                netPriceText: this._formatAmountWithCurrency(sNetPrice, sCurrency),
                netPriceFormatted: this._formatVND(sNetPrice, sCurrency),
                netValue: sNetValue,
                currency: sCurrency,
                valueText: this._formatAmountWithCurrency(sNetValue, sCurrency),
                billingDoc: sDocumentNo,
                billingDate: sBillingDate,
                billingType: sBillingType,
                taxAmount: sTaxAmount,
                grossValue: sGrossValue,
                totalAmount: sTotalAmount,
                shipPoint: sShipPoint,
                shipPointDesc: sShipPointDesc,
                pickingStatus: sPickingStatus,
                pickingDate: sPickingDate,
                pickingBy: sPickingBy,
                pgiStatus: sPgiStatus,
                pgiDate: sPgiDate,
                pgiBy: sPgiBy,
                matDesc: sMatDesc
            };
        },

        _normalizeBusinessItems: function (aRawItems) {
            var aNormalized = (aRawItems || [])
                .map(function (oRawItem) {
                    return this._normalizeBusinessItem(oRawItem);
                }.bind(this))
                .filter(function (oItem) {
                    return !!(
                        oItem.itemNo ||
                        oItem.material ||
                        oItem.description ||
                        oItem.quantityText ||
                        oItem.plant ||
                        oItem.storageLocation ||
                        oItem.deliveryDate ||
                        oItem.valueText
                    );
                });

            return this._mergeNormalizedBusinessItems(aNormalized);
        },

        _normalizeSalesOrderItem: function (oRawItem, sHeaderCurrency) {
            var oItem = oRawItem || {};
            var sItemNo = this._pickDocField(oItem, [
                "itemNo", "item", "Item", "ItemNo", "lineNo", "line", "lineItem",
                "orderItem", "salesOrderItem", "soItem", "position"
            ]);
            var sMaterial = this._pickDocField(oItem, ["material", "Material", "matnr", "partNo", "partNumber"]);
            var sDescription = this._pickDocField(oItem, [
                "description", "desc", "materialDesc", "matDesc", "MatDesc", "shortText", "text", "Description", "MaterialDescription"
            ]);
            var nQuantity = this._toDocNumber(
                this._firstFilledValue([oItem.quantity, oItem.qty, oItem.orderQty, oItem.Quantity])
            );
            var sSalesUnit = this._pickDocField(oItem, ["salesUnit", "SalesUnit", "unit", "uom", "baseUom", "Unit"]);
            var sNetPriceRaw = this._pickDocField(oItem, ["netPrice", "NetPrice"]);
            var sItemValueRaw = this._pickDocField(oItem, ["itemValue", "ItemValue", "netValue", "NetValue", "amount", "total", "lineTotal"]);
            var sCurrency = this._pickDocField(oItem, ["currency", "Currency", "waers"]) || String(sHeaderCurrency || "").trim();
            var sPlant = this._pickDocField(oItem, ["plant", "Plant", "werks"]);
            var sStorLoc = this._pickDocField(oItem, ["storLoc", "StorLoc", "storageLocation", "StorageLoc", "lgort"]);
            var sShipPoint = this._pickDocField(oItem, ["shipPoint", "ShipPoint", "shippingPoint", "ShippingPoint"]);
            var sReqDate = this._formatMonitorDate(this._pickDocField(oItem, ["reqDate", "ReqDate", "reqDateH", "ReqDateH", "deliveryDate", "DelivDate"]));
            var sRefDoc = this._pickDocField(oItem, ["refDoc", "RefDoc", "referenceDoc", "ReferenceDoc"]);
            var sRefItem = this._pickDocField(oItem, ["refItem", "RefItem", "referenceItem", "ReferenceItem"]);
            var sItemCateg = this._pickDocField(oItem, ["itemCateg", "ItemCateg", "itemCategory", "ItemCategory"]);
            var sNetPrice = this._formatAmountWithCurrency(sNetPriceRaw, sCurrency);
            var sItemValue = this._formatAmountWithCurrency(sItemValueRaw, sCurrency);

            return {
                itemNo: sItemNo,
                material: sMaterial,
                description: sDescription,
                quantity: nQuantity,
                salesUnit: sSalesUnit,
                quantityText: this._buildQuantityText(nQuantity, sSalesUnit),
                netPrice: sNetPrice,
                netPriceFormatted: this._formatVND(sNetPriceRaw, sCurrency),
                itemValue: sItemValueRaw,
                valueText: sItemValue,
                currency: sCurrency,
                plant: sPlant,
                storageLocation: sStorLoc,
                shipPoint: sShipPoint,
                reqDate: sReqDate,
                refDoc: sRefDoc,
                refItem: sRefItem,
                itemCateg: sItemCateg
            };
        },

        _normalizeSalesOrderItems: function (aRawItems, sHeaderCurrency) {
            var aNormalized = (aRawItems || [])
                .map(function (oRawItem) {
                    return this._normalizeSalesOrderItem(oRawItem, sHeaderCurrency);
                }.bind(this))
                .filter(function (oItem) {
                    return !!(
                        oItem.itemNo ||
                        oItem.material ||
                        oItem.description ||
                        oItem.quantityText ||
                        oItem.netPrice ||
                        oItem.valueText ||
                        oItem.plant ||
                        oItem.storageLocation ||
                        oItem.shipPoint ||
                        oItem.reqDate ||
                        oItem.refDoc ||
                        oItem.refItem
                    );
                });

            return this._mergeNormalizedBusinessItems(aNormalized);
        },

        _parseAmountNumber: function (sAmount) {
            var sRaw = String(sAmount == null ? "" : sAmount).trim();
            if (!sRaw) {
                return NaN;
            }

            var sClean = sRaw
                .replace(/\s+/g, "")
                .replace(/[^0-9,\.\-]/g, "");
            if (!sClean) {
                return NaN;
            }

            var bHasComma = sClean.indexOf(",") !== -1;
            var bHasDot = sClean.indexOf(".") !== -1;
            if (bHasComma && bHasDot) {
                if (sClean.lastIndexOf(",") > sClean.lastIndexOf(".")) {
                    sClean = sClean.replace(/\./g, "").replace(/,/g, ".");
                } else {
                    sClean = sClean.replace(/,/g, "");
                }
            } else if (bHasComma && !bHasDot) {
                var aParts = sClean.split(",");
                if (aParts.length === 2 && aParts[1].length <= 2) {
                    sClean = aParts[0].replace(/,/g, "") + "." + aParts[1];
                } else {
                    sClean = sClean.replace(/,/g, "");
                }
            }

            var nValue = Number(sClean);
            return isNaN(nValue) ? NaN : nValue;
        },

        _formatAmountWithCurrency: function (sAmount, sCurrency) {
            var sRaw = String(sAmount == null ? "" : sAmount).trim();
            if (!sRaw) {
                return "";
            }

            var sCur = String(sCurrency || "").trim().toUpperCase();
            var nAmount = this._parseAmountNumber(sRaw);
            if (isNaN(nAmount)) {
                return sCur ? (sRaw + " " + sCur) : sRaw;
            }

            if (sCur === "VND" || sCur === "VNĐ") {
                var sVnd = Math.round(nAmount).toLocaleString("vi-VN");
                return sVnd + " VND";
            }

            var sFormatted = nAmount.toLocaleString("en-US", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 2
            });
            return sCur ? (sFormatted + " " + sCur) : sFormatted;
        },

        _firstFilledValue: function (aValues) {
            for (var i = 0; i < (aValues || []).length; i += 1) {
                var vValue = aValues[i];
                if (vValue == null) {
                    continue;
                }
                if (typeof vValue === "number") {
                    if (!isNaN(vValue)) {
                        return String(vValue);
                    }
                    continue;
                }
                if (typeof vValue === "object") {
                    continue;
                }

                var sValue = String(vValue).trim();
                if (sValue) {
                    return sValue;
                }
            }
            return "";
        },

        _safeParseJsonObject: function (vValue) {
            if (vValue && typeof vValue === "object" && !Array.isArray(vValue)) {
                return vValue;
            }

            var sRaw = String(vValue || "").trim();
            if (!sRaw) {
                return {};
            }

            try {
                var oParsed = JSON.parse(sRaw);
                if (oParsed && typeof oParsed === "object" && !Array.isArray(oParsed)) {
                    return oParsed;
                }
            } catch (e) {
                return {};
            }

            return {};
        },

        _arrayFromNode: function (vNode) {
            if (!vNode) {
                return [];
            }

            if (Array.isArray(vNode)) {
                return vNode;
            }

            if (typeof vNode !== "object") {
                return [];
            }

            if (Array.isArray(vNode.item)) {
                return vNode.item;
            }

            if (Array.isArray(vNode.Item)) {
                return vNode.Item;
            }

            if (vNode.item && typeof vNode.item === "object") {
                return [vNode.item];
            }

            if (vNode.Item && typeof vNode.Item === "object") {
                return [vNode.Item];
            }

            return [vNode];
        },

        _safeParseItemsJson: function (sItemsJson) {
            if (!sItemsJson) {
                return { items: [], prs: [], pos: [], raw: {} };
            }

            try {
                var oParsed = JSON.parse(sItemsJson);
                if (Array.isArray(oParsed)) {
                    return { items: oParsed, prs: [], pos: [], raw: {} };
                }

                if (oParsed && typeof oParsed === "object") {
                    return {
                        items: Array.isArray(oParsed.items) ? oParsed.items : [],
                        prs: Array.isArray(oParsed.prs) ? oParsed.prs : [],
                        pos: Array.isArray(oParsed.pos) ? oParsed.pos : [],
                        raw: oParsed
                    };
                }
            } catch (e) {
                return { items: [], prs: [], pos: [], raw: {} };
            }

            return { items: [], prs: [], pos: [], raw: {} };
        },

        _pickMatchedQuotationResultRow: function (aResultRows, oMeta, oRecord) {
            var aRows = Array.isArray(aResultRows) ? aResultRows : [];
            if (!aRows.length) {
                return {};
            }

            var sLookupRequest = this._firstFilledValue([
                oMeta && oMeta.requestId,
                oRecord && oRecord.requestId,
                oMeta && oMeta.purchNoC,
                oRecord && oRecord.purchNoC
            ]).toUpperCase();

            var sLookupQuotation = this._firstFilledValue([
                oMeta && oMeta.quotationNo,
                oRecord && oRecord.quotationNo
            ]).toUpperCase();

            for (var i = 0; i < aRows.length; i += 1) {
                var oRow = aRows[i] || {};
                var sRowRequest = this._firstFilledValue([
                    oRow.requestId,
                    oRow.requestID,
                    oRow.RequestId,
                    oRow.qtReqId,
                    oRow.QtReqId,
                    oRow.QT_REQ_ID,
                    oRow.purchNoC,
                    oRow.PurchNoC,
                    oRow.Items,
                    oRow.items
                ]).toUpperCase();

                if (sLookupRequest && sRowRequest && sLookupRequest === sRowRequest) {
                    return oRow;
                }

                var sRowQuotation = this._firstFilledValue([
                    oRow.quotationNo,
                    oRow.quotation,
                    oRow.quotationNumber,
                    oRow.QuotationNo,
                    oRow.Quotation
                ]).toUpperCase();

                if (sLookupQuotation && sRowQuotation && sLookupQuotation === sRowQuotation) {
                    return oRow;
                }
            }

            return aRows[0] || {};
        },

        _extractResultItems: function (oSource) {
            var oNode = oSource && (
                oSource.ItItems ||
                oSource.itItems ||
                oSource.items ||
                oSource.item
            );

            var aRows = this._arrayFromNode(oNode && (oNode.item || oNode.Item || oNode));
            if (!aRows.length && oSource && Array.isArray(oSource.items)) {
                aRows = oSource.items;
            }
            if (!aRows.length && oSource && Array.isArray(oSource.ItItems)) {
                aRows = oSource.ItItems;
            }

            return aRows;
        },

        _extractQuotationMetaFromPayload: function (oQuotationMeta, oRawContainer, oRecord) {
            var oMeta = (oQuotationMeta && typeof oQuotationMeta === "object") ? oQuotationMeta : {};
            var oRaw = (oRawContainer && typeof oRawContainer === "object") ? oRawContainer : {};

            var oInlinePayload =
                (oMeta.payload && typeof oMeta.payload === "object" && !Array.isArray(oMeta.payload))
                    ? oMeta.payload
                    : ((oRaw.payload && typeof oRaw.payload === "object" && !Array.isArray(oRaw.payload))
                        ? oRaw.payload
                        : null);

            var sPayloadText = this._firstFilledValue([
                oMeta.payload,
                oMeta.rawPayload,
                oMeta.responsePayload,
                oRaw.payload,
                oRaw.rawPayload,
                oRaw.responsePayload
            ]);

            var oPayload = oInlinePayload || this._safeParseJsonObject(sPayloadText);
            if (!oPayload || !Object.keys(oPayload).length) {
                return {};
            }

            var aResultRows = this._arrayFromNode(oPayload.results || oPayload.EtResults || oPayload.etResults);
            var oMatchedResult = this._pickMatchedQuotationResultRow(aResultRows, oMeta, oRecord);
            var oSource = (oMatchedResult && Object.keys(oMatchedResult).length)
                ? oMatchedResult
                : oPayload;

            var aItems = this._extractResultItems(oSource);
            if (!aItems.length && aResultRows.length) {
                for (var i = 0; i < aResultRows.length; i += 1) {
                    aItems = this._extractResultItems(aResultRows[i]);
                    if (aItems.length) {
                        break;
                    }
                }
            }

            var nItemCount = this._toDocNumber(this._firstFilledValue([
                oSource.itemCount,
                oSource.ItemCount,
                oPayload.itemCount,
                oPayload.ItemCount,
                oMeta.itemCount
            ]));
            if (nItemCount <= 0 && aItems.length) {
                nItemCount = aItems.length;
            }

            var sPersistedPayload = sPayloadText;
            if (!sPersistedPayload && oInlinePayload) {
                try {
                    sPersistedPayload = JSON.stringify(oInlinePayload);
                } catch (e) {
                    sPersistedPayload = "";
                }
            }

            return {
                requestId: this._firstFilledValue([
                    oSource.requestId,
                    oSource.requestID,
                    oSource.RequestId,
                    oSource.soReqId,
                    oSource.SoReqId,
                    oSource.SoReqID,
                    oSource.qtReqId,
                    oSource.QtReqId,
                    oSource.QT_REQ_ID,
                    oSource.purchNoC,
                    oSource.PurchNoC,
                    oSource.Items,
                    oSource.items,
                    oPayload.requestId,
                    oPayload.requestID,
                    oPayload.RequestId,
                    oPayload.soReqId,
                    oPayload.SoReqId,
                    oPayload.SoReqID,
                    oPayload.qtReqId,
                    oPayload.QtReqId,
                    oPayload.QT_REQ_ID,
                    oPayload.purchNoC,
                    oPayload.PurchNoC
                ]),
                quotationNo: this._firstFilledValue([
                    oSource.quotationNo,
                    oSource.quotation,
                    oSource.quotationNumber,
                    oSource.QuotationNo,
                    oSource.Quotation,
                    oPayload.quotationNo,
                    oPayload.quotation,
                    oPayload.quotationNumber,
                    oPayload.QuotationNo,
                    oPayload.Quotation
                ]),
                salesOrder: this._firstFilledValue([
                    oSource.salesOrder,
                    oSource.SalesOrder,
                    oPayload.salesOrder,
                    oPayload.SalesOrder
                ]),
                deliveryDoc: this._firstFilledValue([
                    oSource.deliveryDoc,
                    oSource.delivery,
                    oSource.DeliveryNo,
                    oSource.DeliveryDocument,
                    oPayload.deliveryDoc,
                    oPayload.delivery,
                    oPayload.DeliveryNo,
                    oPayload.DeliveryDocument
                ]),
                billingDoc: this._firstFilledValue([
                    oSource.billingDoc,
                    oSource.billing,
                    oSource.BillingDocument,
                    oPayload.billingDoc,
                    oPayload.billing,
                    oPayload.BillingDocument
                ]),
                soldTo: this._firstFilledValue([
                    oSource.soldTo,
                    oSource.SoldTo,
                    oSource.customerId,
                    oPayload.soldTo,
                    oPayload.SoldTo,
                    oPayload.customerId
                ]),
                soldToName: this._firstFilledValue([
                    oSource.soldToName,
                    oSource.SoldToName,
                    oSource.customerName,
                    oPayload.soldToName,
                    oPayload.SoldToName,
                    oPayload.customerName
                ]),
                customerId: this._firstFilledValue([
                    oSource.customerId,
                    oSource.soldTo,
                    oSource.SoldTo,
                    oPayload.customerId,
                    oPayload.soldTo,
                    oPayload.SoldTo
                ]),
                customerName: this._firstFilledValue([
                    oSource.customerName,
                    oSource.soldToName,
                    oSource.SoldToName,
                    oPayload.customerName,
                    oPayload.soldToName,
                    oPayload.SoldToName
                ]),
                purchNoC: this._firstFilledValue([
                    oSource.purchNoC,
                    oSource.PurchNoC,
                    oPayload.purchNoC,
                    oPayload.PurchNoC
                ]),
                uploadType: this._firstFilledValue([
                    oPayload.fileType,
                    oPayload.uploadType,
                    oPayload.FileType,
                    oPayload.UploadType,
                    oRaw.fileType,
                    oRaw.uploadType,
                    oMeta.uploadType
                ]),
                docType: this._firstFilledValue([
                    oSource.docType,
                    oSource.DocType,
                    oPayload.docType,
                    oPayload.DocType
                ]),
                salesOrg: this._firstFilledValue([
                    oSource.salesOrg,
                    oSource.SalesOrg,
                    oPayload.salesOrg,
                    oPayload.SalesOrg
                ]),
                distrChan: this._firstFilledValue([
                    oSource.distrChan,
                    oSource.DistrChan,
                    oPayload.distrChan,
                    oPayload.DistrChan
                ]),
                division: this._firstFilledValue([
                    oSource.division,
                    oSource.Division,
                    oPayload.division,
                    oPayload.Division
                ]),
                shipTo: this._firstFilledValue([
                    oSource.shipTo,
                    oSource.ShipTo,
                    oPayload.shipTo,
                    oPayload.ShipTo
                ]),
                poNumber: this._firstFilledValue([
                    oSource.poNumber,
                    oSource.poNo,
                    oSource.PoNumber,
                    oSource.PONumber,
                    oPayload.poNumber,
                    oPayload.poNo,
                    oPayload.PoNumber,
                    oPayload.PONumber
                ]),
                reqDateH: this._firstFilledValue([
                    oSource.reqDateH,
                    oSource.ReqDateH,
                    oSource.reqDate,
                    oSource.ReqDate,
                    oPayload.reqDateH,
                    oPayload.ReqDateH,
                    oPayload.reqDate,
                    oPayload.ReqDate
                ]),
                netValue: this._firstFilledValue([
                    oSource.netValue,
                    oSource.NetValue,
                    oPayload.netValue,
                    oPayload.NetValue
                ]),
                taxAmount: this._firstFilledValue([
                    oSource.taxAmount,
                    oSource.TaxAmount,
                    oPayload.taxAmount,
                    oPayload.TaxAmount
                ]),
                grossValue: this._firstFilledValue([
                    oSource.grossValue,
                    oSource.GrossValue,
                    oPayload.grossValue,
                    oPayload.GrossValue
                ]),
                currency: this._firstFilledValue([
                    oSource.currency,
                    oSource.Currency,
                    oPayload.currency,
                    oPayload.Currency
                ]),
                pmnttrms: this._firstFilledValue([
                    oSource.pmnttrms,
                    oSource.Pmnttrms,
                    oSource.paymentTerms,
                    oSource.PaymentTerms,
                    oPayload.pmnttrms,
                    oPayload.Pmnttrms,
                    oPayload.paymentTerms,
                    oPayload.PaymentTerms
                ]),
                pmnttrmsText: this._firstFilledValue([
                    oSource.pmnttrmsText,
                    oSource.PmnttrmsText,
                    oSource.paymentTermsText,
                    oSource.PaymentTermsText,
                    oPayload.pmnttrmsText,
                    oPayload.PmnttrmsText,
                    oPayload.paymentTermsText,
                    oPayload.PaymentTermsText
                ]),
                incoterms1: this._firstFilledValue([
                    oSource.incoterms1,
                    oSource.Incoterms1,
                    oSource.Incoterms,
                    oPayload.incoterms1,
                    oPayload.Incoterms1,
                    oPayload.Incoterms
                ]),
                incoterms1Text: this._firstFilledValue([
                    oSource.incoterms1Text,
                    oSource.Incoterms1Text,
                    oSource.incotermsText,
                    oSource.IncotermsText,
                    oPayload.incoterms1Text,
                    oPayload.Incoterms1Text,
                    oPayload.incotermsText,
                    oPayload.IncotermsText
                ]),
                incoterms2: this._firstFilledValue([
                    oSource.incoterms2,
                    oSource.Incoterms2,
                    oPayload.incoterms2,
                    oPayload.Incoterms2
                ]),
                validFrom: this._formatMonitorDate(this._firstFilledValue([
                    oSource.validFrom,
                    oSource.ValidFrom,
                    oPayload.validFrom,
                    oPayload.ValidFrom
                ])),
                validTo: this._formatMonitorDate(this._firstFilledValue([
                    oSource.validTo,
                    oSource.ValidTo,
                    oPayload.validTo,
                    oPayload.ValidTo
                ])),
                createdBy: this._firstFilledValue([
                    oSource.createdBy,
                    oSource.CreatedBy,
                    oPayload.createdBy,
                    oPayload.CreatedBy
                ]),
                createdAt: this._formatMonitorDateTime(this._firstFilledValue([
                    oSource.createdAt,
                    oSource.CreatedAt,
                    oPayload.createdAt,
                    oPayload.CreatedAt
                ])),
                message: this._firstFilledValue([
                    oSource.message,
                    oSource.Message,
                    oSource.msgDesc,
                    oSource.MsgDesc,
                    oPayload.message,
                    oPayload.Message,
                    oPayload.msgDesc,
                    oPayload.MsgDesc
                ]),
                deliveryStatus: this._firstFilledValue([
                    oSource.deliveryStatus,
                    oSource.DeliveryStatus,
                    oPayload.deliveryStatus,
                    oPayload.DeliveryStatus,
                    oSource.status,
                    oSource.Status
                ]),
                pickingStatus: this._firstFilledValue([
                    oSource.pickingStatus,
                    oSource.PickingStatus,
                    oSource.pickStatus,
                    oSource.PickStatus,
                    oPayload.pickingStatus,
                    oPayload.PickingStatus,
                    oPayload.pickStatus,
                    oPayload.PickStatus
                ]),
                pickingDate: this._formatMonitorDate(this._firstFilledValue([
                    oSource.pickingDate,
                    oSource.PickingDate,
                    oSource.pickDate,
                    oSource.PickDate,
                    oPayload.pickingDate,
                    oPayload.PickingDate,
                    oPayload.pickDate,
                    oPayload.PickDate
                ])),
                pickingBy: this._firstFilledValue([
                    oSource.pickingBy,
                    oSource.PickingBy,
                    oSource.pickBy,
                    oSource.PickBy,
                    oPayload.pickingBy,
                    oPayload.PickingBy,
                    oPayload.pickBy,
                    oPayload.PickBy
                ]),
                pgiStatus: this._firstFilledValue([
                    oSource.pgiStatus,
                    oSource.PGIStatus,
                    oSource.postGoodsIssueStatus,
                    oSource.PostGoodsIssueStatus,
                    oPayload.pgiStatus,
                    oPayload.PGIStatus,
                    oPayload.postGoodsIssueStatus,
                    oPayload.PostGoodsIssueStatus
                ]),
                pgiDate: this._formatMonitorDate(this._firstFilledValue([
                    oSource.pgiDate,
                    oSource.PGIDate,
                    oSource.postGoodsIssueDate,
                    oSource.PostGoodsIssueDate,
                    oPayload.pgiDate,
                    oPayload.PGIDate,
                    oPayload.postGoodsIssueDate,
                    oPayload.PostGoodsIssueDate
                ])),
                pgiBy: this._firstFilledValue([
                    oSource.pgiBy,
                    oSource.PGIBy,
                    oSource.postGoodsIssueBy,
                    oSource.PostGoodsIssueBy,
                    oPayload.pgiBy,
                    oPayload.PGIBy,
                    oPayload.postGoodsIssueBy,
                    oPayload.PostGoodsIssueBy
                ]),
                callbackStep: this._firstFilledValue([
                    oPayload.callbackStep,
                    oPayload.currentStage,
                    oPayload.stage,
                    oPayload.currentIFlow,
                    oPayload.currentIflow
                ]),
                callbackStatus: this._firstFilledValue([
                    oPayload.callbackStatus,
                    oPayload.status,
                    oPayload.Status
                ]),
                workflowInstanceId: this._firstFilledValue([
                    oPayload.workflowInstanceId,
                    oPayload.workflowId,
                    oPayload.WorkflowInstanceId
                ]),
                itemCount: nItemCount,
                payload: sPersistedPayload,
                items: aItems
            };
        },

        _mergeQuotationMeta: function (oPrimaryMeta, oFallbackMeta) {
            var oPrimary = (oPrimaryMeta && typeof oPrimaryMeta === "object") ? oPrimaryMeta : {};
            var oFallback = (oFallbackMeta && typeof oFallbackMeta === "object") ? oFallbackMeta : {};
            var oMerged = {};

            var aFields = [
                "requestId",
                "quotationNo",
                "salesOrder",
                "deliveryDoc",
                "billingDoc",
                "soldTo",
                "soldToName",
                "customerId",
                "customerName",
                "purchNoC",
                "docType",
                "salesOrg",
                "distrChan",
                "division",
                "shipTo",
                "poNumber",
                "reqDateH",
                "netValue",
                "taxAmount",
                "grossValue",
                "currency",
                "pmnttrms",
                "pmnttrmsText",
                "incoterms1",
                "incoterms1Text",
                "incoterms2",
                "validFrom",
                "validTo",
                "createdBy",
                "createdAt",
                "message",
                "deliveryStatus",
                "pickingStatus",
                "pickingDate",
                "pickingBy",
                "pgiStatus",
                "pgiDate",
                "pgiBy",
                "payload",
                "callbackStep",
                "callbackStatus",
                "workflowInstanceId",
                "uploadType"
            ];

            aFields.forEach(function (sField) {
                var sValue = this._firstFilledValue([oPrimary[sField], oFallback[sField]]);
                if (sValue) {
                    oMerged[sField] = sValue;
                }
            }.bind(this));

            var aItems = [];
            if (Array.isArray(oPrimary.items) && oPrimary.items.length) {
                aItems = oPrimary.items;
            } else if (Array.isArray(oFallback.items) && oFallback.items.length) {
                aItems = oFallback.items;
            }

            if (aItems.length) {
                oMerged.items = aItems;
            }

            var nItemCount = this._toDocNumber(this._firstFilledValue([
                oPrimary.itemCount,
                oFallback.itemCount
            ]));
            if (nItemCount <= 0 && aItems.length) {
                nItemCount = aItems.length;
            }
            if (nItemCount > 0) {
                oMerged.itemCount = nItemCount;
            }

            return oMerged;
        },

        _resolveParentRow: function (oRow) {
            var oCurrentRow = oRow || {};
            if (oCurrentRow.isParent || !oCurrentRow.parentGroupId) {
                return oCurrentRow;
            }

            var sParentGroupId = String(oCurrentRow.parentGroupId || "").trim();
            if (!sParentGroupId) {
                return oCurrentRow;
            }

            var oParentRow = this._allRows.find(function (oCandidate) {
                return oCandidate && oCandidate.isParent && oCandidate.groupId === sParentGroupId;
            });

            return oParentRow || oCurrentRow;
        },

        _buildHeaderLine: function (aParts, sPrefix) {
            var aTextParts = (aParts || [])
                .map(function (vPart) { return String(vPart == null ? "" : vPart).trim(); })
                .filter(Boolean);

            if (!aTextParts.length) {
                return "";
            }

            var sLine = aTextParts.join(" | ");
            return sPrefix ? (sPrefix + ": " + sLine) : sLine;
        },

        _buildQuotationDetailHeader: function (oRow, aItemRows) {
            var oMeta = (oRow && oRow.quotationMeta) || {};
            var sQuotationNo = this._firstFilledValue([oRow && oRow.quotationNo, oMeta.quotationNo]) || "N/A";

            // Extract from payload for latest data
            var oPayloadMeta = this._extractQuotationMetaFromPayload(oMeta, oMeta, oRow);

            var sCustomerId = this._firstFilledValue([
                oMeta.customerId,
                oMeta.soldTo,
                oRow && oRow.customerId
            ]);
            var sCustomerName = this._firstFilledValue([
                oMeta.customerName,
                oMeta.soldToName,
                oRow && oRow.customerName
            ]);
            var sCustomerDisplay = this._formatCustomerDisplay(sCustomerId, sCustomerName) || "N/A";
            var sRequestId = this._firstFilledValue([oMeta.requestId, oRow && oRow.requestId]);
            var sPurchNoC = this._firstFilledValue([oMeta.purchNoC, oRow && oRow.purchNoC]);
            var sCurrency = this._firstFilledValue([oMeta.currency, oPayloadMeta.currency]);
            var sNetValue = this._formatAmountWithCurrency(
                this._firstFilledValue([oMeta.netValue, oPayloadMeta.netValue]), sCurrency
            );
            var sTaxAmount = this._formatAmountWithCurrency(
                this._firstFilledValue([oMeta.taxAmount, oPayloadMeta.taxAmount]), sCurrency
            );
            var sGrossValue = this._formatAmountWithCurrency(
                this._firstFilledValue([oMeta.grossValue, oPayloadMeta.grossValue]), sCurrency
            );
            var sPmnttrms = this._firstFilledValue([oMeta.pmnttrms, oMeta.Pmnttrms, oPayloadMeta.pmnttrms]);
            var sPmnttrmsText = this._firstFilledValue([
                oMeta.pmnttrmsText,
                oMeta.PmnttrmsText,
                oPayloadMeta.pmnttrmsText
            ]);
            var sIncoterms1 = this._firstFilledValue([oMeta.incoterms1, oMeta.Incoterms1, oMeta.Incoterms, oPayloadMeta.incoterms1]);
            var sIncoterms1Text = this._firstFilledValue([
                oMeta.incoterms1Text,
                oMeta.Incoterms1Text,
                oPayloadMeta.incoterms1Text
            ]);
            var sIncoterms2 = this._firstFilledValue([oMeta.incoterms2, oMeta.Incoterms2, oPayloadMeta.incoterms2]);
            var sValidFrom = this._formatMonitorDate(this._firstFilledValue([oMeta.validFrom]));
            var sValidTo = this._formatMonitorDate(this._firstFilledValue([oMeta.validTo]));
            var sCreatedBy = this._firstFilledValue([oMeta.createdBy]);
            var sCreatedAt = this._formatMonitorDateTime(this._firstFilledValue([oMeta.createdAt]));
            var sCallbackStep = this._firstFilledValue([oMeta.callbackStep]);
            var sWorkflowId = this._firstFilledValue([oMeta.workflowInstanceId]);

            var sPaymentTermLine = [sPmnttrms, sPmnttrmsText].filter(Boolean).join(" - ");
            var sIncotermDetail = [sIncoterms1Text, sIncoterms2].filter(Boolean).join(" - ");
            var sIncotermLine = [sIncoterms1, sIncotermDetail].filter(Boolean).join(" - ");
            var sTermsLine = this._buildHeaderLine([
                sPaymentTermLine ? ("Payment Term: " + sPaymentTermLine) : "",
                sIncotermLine ? ("Incoterm: " + sIncotermLine) : ""
            ]);

            var nItemsFromRows = Array.isArray(aItemRows) ? aItemRows.length : 0;
            var nItemCount = this._toDocNumber(this._firstFilledValue([oMeta.itemCount, oRow && oRow.itemCount]));
            if (nItemCount <= 0) {
                nItemCount = nItemsFromRows;
            }

            var sStatusText = this._resolveStatusText(oRow && oRow.statusCode, oRow && oRow.statusText);
            var sStatusState = sStatusText === "Completed"
                ? "Success"
                : (sStatusText === "Failed" ? "Error" : "Information");

            var sValidityLine = "";
            if (sValidFrom || sValidTo) {
                sValidityLine = sValidFrom && sValidTo
                    ? ("Validity: " + sValidFrom + " -> " + sValidTo)
                    : ("Validity: " + (sValidFrom || sValidTo));
            }

            var sCreatedLine = "";
            if (sCreatedAt || sCreatedBy) {
                sCreatedLine = "Created: " + [sCreatedAt, sCreatedBy].filter(Boolean).join(" by ");
            }

            var sItemLine = "";
            if (nItemCount > 0) {
                sItemLine = "Items: " + nItemCount;
                if (nItemsFromRows > 0 && nItemsFromRows !== nItemCount) {
                    sItemLine += " (showing " + nItemsFromRows + ")";
                }
            }

            var sMessage = this._firstFilledValue([
                oMeta.message,
                oRow && oRow.reasonMessage,
                oRow && oRow.message
            ]);

            return {
                quotationNo: sQuotationNo,
                customerTitle: sCustomerDisplay,
                customerSubTitle: "Quotation: " + sQuotationNo,
                requestText: this._buildHeaderLine([
                    sRequestId ? ("Request ID: " + sRequestId) : "",
                    sPurchNoC ? ("PurchNoC: " + sPurchNoC) : ""
                ]),
                customerText: this._buildHeaderLine([
                    sCustomerId ? ("Sold-To ID: " + sCustomerId) : "",
                    sCustomerName ? ("Sold-To Name: " + sCustomerName) : ""
                ]),
                financialText: this._buildHeaderLine([
                    sNetValue ? ("Net: " + sNetValue) : "",
                    sTaxAmount ? ("Tax: " + sTaxAmount) : "",
                    sGrossValue ? ("Gross: " + sGrossValue) : ""
                ]),
                processText: this._buildHeaderLine([
                    oRow && oRow.flowStage ? ("iFlow: " + oRow.flowStage) : "",
                    sCallbackStep ? ("Callback: " + sCallbackStep) : "",
                    sWorkflowId ? ("Workflow: " + sWorkflowId) : ""
                ]),
                documentText: this._buildHeaderLine([
                    oRow && oRow.salesOrder ? ("Sales Order: " + oRow.salesOrder) : "",
                    oRow && oRow.delivery ? ("Delivery: " + oRow.delivery) : "",
                    oRow && oRow.billing ? ("Billing: " + oRow.billing) : ""
                ]),
                referenceLine: this._buildHeaderLine([
                    sRequestId ? ("Request ID: " + sRequestId) : "",
                    sPurchNoC ? ("PurchNoC: " + sPurchNoC) : ""
                ]),
                soldToLine: this._buildHeaderLine([
                    sCustomerId ? ("Sold-To ID: " + sCustomerId) : "",
                    sCustomerName ? ("Sold-To Name: " + sCustomerName) : ""
                ]),
                termsLine: sTermsLine,
                paymentTermLine: sPaymentTermLine,
                incotermLine: sIncotermLine,
                financialLine: this._buildHeaderLine([
                    sNetValue ? ("Net: " + sNetValue) : "",
                    sTaxAmount ? ("Tax: " + sTaxAmount) : "",
                    sGrossValue ? ("Gross: " + sGrossValue) : ""
                ]),
                validityLine: sValidityLine,
                processLine: this._buildHeaderLine([
                    oRow && oRow.flowStage ? ("iFlow: " + oRow.flowStage) : "",
                    sCallbackStep ? ("Callback: " + sCallbackStep) : "",
                    sWorkflowId ? ("Workflow: " + sWorkflowId) : ""
                ]),
                documentLine: this._buildHeaderLine([
                    oRow && oRow.salesOrder ? ("Sales Order: " + oRow.salesOrder) : "",
                    oRow && oRow.delivery ? ("Delivery: " + oRow.delivery) : "",
                    oRow && oRow.billing ? ("Billing: " + oRow.billing) : ""
                ]),
                itemLine: sItemLine,
                createdLine: sCreatedLine,
                validityText: sValidityLine,
                createdText: sCreatedLine,
                auditText: this._buildHeaderLine([sValidityLine, sCreatedLine]),
                itemText: sItemLine,
                netValueText: sNetValue || "N/A",
                taxValueText: sTaxAmount || "N/A",
                grossValueText: sGrossValue || "N/A",
                itemCountText: nItemCount > 0 ? String(nItemCount) : "0",
                messageLine: sMessage ? ("Message: " + sMessage) : "",
                hasMessage: !!sMessage,
                statusText: sStatusText,
                statusState: sStatusState,
                // New fields for redesigned dialog
                customerName: sCustomerName || "Unknown Customer",
                customerCode: sCustomerId || "N/A",
                validFrom: sValidFrom || "-",
                validTo: sValidTo || "-",
                netValue: oMeta.netValue || "0",
                taxValue: oMeta.taxAmount || "0",
                grossValue: oMeta.grossValue || "0",
                currency: sCurrency || "VND",
                // Formatted values for Vietnamese currency display
                netValueFormatted: this._formatVND(oMeta.netValue, sCurrency),
                taxValueFormatted: this._formatVND(oMeta.taxAmount, sCurrency),
                grossValueFormatted: this._formatVND(oMeta.grossValue, sCurrency, true)
            };
        },

        _formatVND: function(sValue, sCurrency, bBold) {
            var nValue = parseFloat(sValue) || 0;
            if (nValue === 0) return "0 " + (sCurrency || "VND");
            
            // Format with Vietnamese thousand separator (.) and no decimal
            var sFormatted = nValue.toLocaleString("vi-VN", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });
            
            return sFormatted + " " + (sCurrency || "VND");
        },

        _createQuotationStatTile: function (sLabel, sValue, sClassName) {
            return new sap.m.VBox({
                class: "quotationStatTile " + (sClassName || ""),
                items: [
                    new sap.m.Text({ text: sLabel, class: "quotationStatLabel" }),
                    new sap.m.Text({ text: sValue || "N/A", class: "quotationStatValue", wrapping: true })
                ]
            });
        },

        _createQuotationInfoTile: function (sLabel, sValue, sClassName) {
            return new sap.m.VBox({
                class: "quotationInfoTile " + (sClassName || ""),
                items: [
                    new sap.m.Text({ text: sLabel, class: "quotationInfoLabel" }),
                    new sap.m.Text({ text: sValue || "N/A", class: "quotationInfoValue", wrapping: true })
                ]
            });
        },

        _buildSalesOrderDetailData: function (oRow) {
            var oResolvedRow = this._resolveParentRow(oRow || {});
            var oBaseMeta = (oResolvedRow.quotationMeta && typeof oResolvedRow.quotationMeta === "object")
                ? oResolvedRow.quotationMeta
                : {};
            var oPayloadMeta = this._extractQuotationMetaFromPayload(oBaseMeta, oBaseMeta, oResolvedRow);
            var oMeta = this._mergeQuotationMeta(oBaseMeta, oPayloadMeta);

            var sSalesOrder = this._firstFilledValue([oResolvedRow.salesOrder, oMeta.salesOrder]);
            var sQuotationNo = this._firstFilledValue([oResolvedRow.quotationNo, oMeta.quotationNo]);
            var sRequestId = this._firstFilledValue([oMeta.requestId, oResolvedRow.requestId]);
            var sPurchNoC = this._firstFilledValue([oMeta.purchNoC, oResolvedRow.purchNoC]);
            var sPoNumber = this._firstFilledValue([oMeta.poNumber]);
            var sSoldToId = this._firstFilledValue([oMeta.customerId, oMeta.soldTo, oResolvedRow.customerId]);
            var sSoldToName = this._firstFilledValue([oMeta.customerName, oMeta.soldToName, oResolvedRow.customerName]);
            var sShipTo = this._firstFilledValue([oMeta.shipTo]);
            var sCustomerDisplay = this._formatCustomerDisplay(sSoldToId, sSoldToName) || "N/A";

            var sDocType = this._firstFilledValue([oMeta.docType]);
            var sSalesOrg = this._firstFilledValue([oMeta.salesOrg]);
            var sDistrChan = this._firstFilledValue([oMeta.distrChan]);
            var sDivision = this._firstFilledValue([oMeta.division]);

            var sCurrency = this._firstFilledValue([oMeta.currency]);
            var sNetValue = this._formatAmountWithCurrency(oMeta.netValue, sCurrency);
            var sTaxAmount = this._formatAmountWithCurrency(oMeta.taxAmount, sCurrency);
            var sGrossValue = this._formatAmountWithCurrency(oMeta.grossValue, sCurrency);

            var sReqDateH = this._formatMonitorDate(this._firstFilledValue([oMeta.reqDateH]));
            var sCreatedBy = this._firstFilledValue([oMeta.createdBy]);
            var sCreatedAt = this._formatMonitorDateTime(this._firstFilledValue([oMeta.createdAt]));
            var sCallbackStep = this._firstFilledValue([oMeta.callbackStep]);
            var sWorkflowId = this._firstFilledValue([oMeta.workflowInstanceId]);
            var sMessage = this._firstFilledValue([
                oMeta.message,
                oResolvedRow.reasonMessage,
                oResolvedRow.message
            ]);

            var aRawItems = [];
            if (Array.isArray(oMeta.items) && oMeta.items.length) {
                aRawItems = oMeta.items;
            } else if (Array.isArray(oResolvedRow.salesItemDetails) && oResolvedRow.salesItemDetails.length) {
                aRawItems = oResolvedRow.salesItemDetails;
            }

            var aItemRows = this._normalizeSalesOrderItems(aRawItems, sCurrency);
            if (!aItemRows.length) {
                var aFallbackItems = this._getBusinessItemDetails(oResolvedRow);
                aItemRows = (aFallbackItems || []).map(function (oItem) {
                    return {
                        itemNo: oItem.itemNo,
                        material: oItem.material,
                        description: oItem.description,
                        quantityText: oItem.quantityText,
                        netPrice: "",
                        valueText: oItem.valueText,
                        plant: oItem.plant,
                        storageLocation: oItem.storageLocation,
                        shipPoint: "",
                        reqDate: oItem.deliveryDate,
                        refDoc: "",
                        refItem: "",
                        itemCateg: ""
                    };
                });
            }

            var nItemCount = this._toDocNumber(this._firstFilledValue([
                oMeta.itemCount,
                oResolvedRow.itemCount,
                aItemRows.length
            ]));
            if (nItemCount <= 0) {
                nItemCount = aItemRows.length;
            }

            var sStatusText = this._resolveStatusText(oResolvedRow.statusCode, oResolvedRow.statusText);
            var sStatusState = sStatusText === "Completed"
                ? "Success"
                : (sStatusText === "Failed" ? "Error" : "Information");

            var sScheduleLine = this._buildHeaderLine([
                sReqDateH ? ("Requested Date: " + sReqDateH) : "",
                sCreatedAt ? ("Created At: " + sCreatedAt) : "",
                sCreatedBy ? ("Created By: " + sCreatedBy) : ""
            ]);

            return {
                header: {
                    customerTitle: sCustomerDisplay,
                    customerSubTitle: "Sales Order: " + (sSalesOrder || "N/A"),
                    referenceLine: this._buildHeaderLine([
                        sRequestId ? ("Request ID: " + sRequestId) : "",
                        sQuotationNo ? ("Quotation: " + sQuotationNo) : "",
                        sPurchNoC ? ("PurchNoC: " + sPurchNoC) : "",
                        sPoNumber ? ("PO Number: " + sPoNumber) : ""
                    ]),
                    partnerLine: this._buildHeaderLine([
                        sSoldToId ? ("Sold-To: " + sSoldToId) : "",
                        sSoldToName ? ("Sold-To Name: " + sSoldToName) : "",
                        sShipTo ? ("Ship-To: " + sShipTo) : ""
                    ]),
                    orgLine: this._buildHeaderLine([
                        sDocType ? ("Doc Type: " + sDocType) : "",
                        sSalesOrg ? ("Sales Org: " + sSalesOrg) : "",
                        sDistrChan ? ("Channel: " + sDistrChan) : "",
                        sDivision ? ("Division: " + sDivision) : ""
                    ]),
                    financialLine: this._buildHeaderLine([
                        sNetValue ? ("Net: " + sNetValue) : "",
                        sTaxAmount ? ("Tax: " + sTaxAmount) : "",
                        sGrossValue ? ("Gross: " + sGrossValue) : ""
                    ]),
                    processLine: this._buildHeaderLine([
                        oResolvedRow.flowStage ? ("iFlow: " + oResolvedRow.flowStage) : "",
                        sCallbackStep ? ("Callback: " + sCallbackStep) : "",
                        sWorkflowId ? ("Workflow: " + sWorkflowId) : ""
                    ]),
                    documentLine: this._buildHeaderLine([
                        sSalesOrder ? ("Sales Order: " + sSalesOrder) : "",
                        oResolvedRow.delivery ? ("Delivery: " + oResolvedRow.delivery) : "",
                        oResolvedRow.billing ? ("Billing: " + oResolvedRow.billing) : ""
                    ]),
                    scheduleLine: sScheduleLine,
                    itemLine: nItemCount > 0 ? ("Items: " + nItemCount + (aItemRows.length !== nItemCount ? (" (showing " + aItemRows.length + ")") : "")) : "",
                    messageLine: sMessage ? ("Message: " + sMessage) : "",
                    hasMessage: !!sMessage,
                    statusText: sStatusText,
                    statusState: sStatusState
                },
                list: aItemRows,
                salesOrder: sSalesOrder
            };
        },

        _resolveExecutionStatus: function (vStatus, sExecutedAt) {
            var sRaw = String(vStatus == null ? "" : vStatus).trim();
            var sUpper = sRaw.toUpperCase();
            var sExecuted = String(sExecutedAt == null ? "" : sExecutedAt).trim();

            if (!sUpper) {
                if (sExecuted) {
                    return { text: "Completed", state: "Success" };
                }
                return { text: "Not Started", state: "None" };
            }

            if (/^(C|X|S|Y|1|TRUE|T)$/.test(sUpper)) {
                return { text: "Completed", state: "Success" };
            }

            if (/^(N|0|FALSE|F)$/.test(sUpper)) {
                return { text: "Not Started", state: "None" };
            }

            if (/^(P|R|I|W)$/.test(sUpper)) {
                return { text: "In Progress", state: "Information" };
            }

            if (/(NOT[_\s-]*START|N\/?A|NONE|INITIAL)/.test(sUpper)) {
                return { text: "Not Started", state: "None" };
            }

            if (/(FAIL|ERROR|REJECT|CANCEL|EXCEPTION)/.test(sUpper)) {
                return { text: "Failed", state: "Error" };
            }

            if (/(IN[_\s-]*PROGRESS|RUNNING|PENDING|QUEUE|WAIT|PROCESSING|STARTED)/.test(sUpper)) {
                return { text: "In Progress", state: "Information" };
            }

            if (/(COMPLETE|COMPLETED|SUCCESS|DONE|POSTED|CONFIRMED|PICKED|PGI|ISSUED|FINISHED|OK)/.test(sUpper)) {
                return { text: "Completed", state: "Success" };
            }

            var sPretty = sRaw.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
            if (sPretty) {
                sPretty = sPretty.charAt(0).toUpperCase() + sPretty.slice(1).toLowerCase();
            }
            return { text: sPretty || "Not Started", state: "Information" };
        },

        _buildExecutionByText: function (sDate, sBy) {
            var sRawDate = String(sDate == null ? "" : sDate).trim();
            var bHasTime = /(?:T|\s)\d{1,2}:\d{2}/.test(sRawDate) || /^\d{14}$/.test(sRawDate);
            var sSafeDate = (bHasTime ? this._formatMonitorDateTime(sRawDate) : this._formatMonitorDate(sRawDate)) || sRawDate;
            var sSafeBy = String(sBy == null ? "" : sBy).trim();

            if (sSafeDate && sSafeBy) {
                return sSafeDate + " | " + sSafeBy;
            }
            if (sSafeDate) {
                return sSafeDate;
            }
            if (sSafeBy) {
                return sSafeBy;
            }
            return "-";
        },

        _normalizeDeliveryItem: function (oRawItem, oHeaderDefaults, sCurrency) {
            var oRaw = oRawItem || {};
            var oHeader = oHeaderDefaults || {};
            var oBase = this._normalizeBusinessItem(oRaw);

            var sDocumentNo = this._firstFilledValue([
                oBase.documentNo,
                this._pickDocField(oRaw, ["documentNo", "DocumentNo", "deliveryDoc", "deliveryNo", "DeliveryNo", "DeliveryDocument", "vbeln"]),
                oHeader.deliveryDoc
            ]);

            var sPickingStatusRaw = this._firstFilledValue([
                oBase.pickingStatus,
                this._pickDocField(oRaw, ["pickingStatus", "PickingStatus", "pickStatus", "PickStatus", "pickingState", "PickingState"]),
                oHeader.pickingStatus
            ]);
            var sPickingDate = this._formatMonitorDate(this._firstFilledValue([
                oBase.pickingDate,
                this._pickDocField(oRaw, ["pickingDate", "PickingDate", "pickDate", "PickDate", "pickingAt"]),
                oHeader.pickingDate
            ]));
            var sPickingBy = this._firstFilledValue([
                oBase.pickingBy,
                this._pickDocField(oRaw, ["pickingBy", "PickingBy", "pickBy", "PickBy", "pickingUser", "PickingUser"]),
                oHeader.pickingBy
            ]);

            var sPgiStatusRaw = this._firstFilledValue([
                oBase.pgiStatus,
                this._pickDocField(oRaw, ["pgiStatus", "PGIStatus", "postGoodsIssueStatus", "PostGoodsIssueStatus", "giStatus", "GIStatus"]),
                oHeader.pgiStatus
            ]);
            var sPgiDate = this._formatMonitorDate(this._firstFilledValue([
                oBase.pgiDate,
                this._pickDocField(oRaw, ["pgiDate", "PGIDate", "postGoodsIssueDate", "PostGoodsIssueDate", "giDate"]),
                oHeader.pgiDate
            ]));
            var sPgiBy = this._firstFilledValue([
                oBase.pgiBy,
                this._pickDocField(oRaw, ["pgiBy", "PGIBy", "postGoodsIssueBy", "PostGoodsIssueBy", "giBy"]),
                oHeader.pgiBy
            ]);

            var oPickingStatus = this._resolveExecutionStatus(sPickingStatusRaw, sPickingDate);
            var oPgiStatus = this._resolveExecutionStatus(sPgiStatusRaw, sPgiDate);

            return {
                documentNo: sDocumentNo,
                itemNo: oBase.itemNo,
                material: oBase.material,
                description: oBase.description,
                quantityText: oBase.quantityText,
                plant: oBase.plant,
                storageLocation: oBase.storageLocation,
                deliveryDate: oBase.deliveryDate,
                valueText: oBase.valueText || this._formatAmountWithCurrency(oBase.netValue, sCurrency),
                pickingStatusText: oPickingStatus.text,
                pickingStatusState: oPickingStatus.state,
                pickingDate: sPickingDate,
                pickingBy: sPickingBy,
                pickingAtText: this._buildExecutionByText(sPickingDate, sPickingBy),
                pgiStatusText: oPgiStatus.text,
                pgiStatusState: oPgiStatus.state,
                pgiDate: sPgiDate,
                pgiBy: sPgiBy,
                pgiAtText: this._buildExecutionByText(sPgiDate, sPgiBy)
            };
        },

        _normalizeDeliveryItems: function (aRawItems, oHeaderDefaults, sCurrency) {
            var aSource = Array.isArray(aRawItems) ? aRawItems : [];
            var aRows = [];
            var mByKey = Object.create(null);

            aSource.forEach(function (oRawItem, iIndex) {
                var oRow = this._normalizeDeliveryItem(oRawItem, oHeaderDefaults, sCurrency);
                var bHasContent = !!(
                    oRow.documentNo ||
                    oRow.itemNo ||
                    oRow.material ||
                    oRow.description
                );
                if (!bHasContent) {
                    return;
                }

                var sKey = this._buildBusinessItemKey(oRow) || ("delivery_" + iIndex);
                var oExisting = mByKey[sKey];
                if (!oExisting) {
                    mByKey[sKey] = oRow;
                    aRows.push(oRow);
                    return;
                }

                [
                    "documentNo",
                    "itemNo",
                    "material",
                    "description",
                    "quantityText",
                    "plant",
                    "storageLocation",
                    "deliveryDate",
                    "valueText"
                ].forEach(function (sField) {
                    if (!oExisting[sField] && oRow[sField]) {
                        oExisting[sField] = oRow[sField];
                    }
                });

                [
                    "pickingStatusText",
                    "pickingStatusState",
                    "pickingDate",
                    "pickingBy",
                    "pickingAtText",
                    "pgiStatusText",
                    "pgiStatusState",
                    "pgiDate",
                    "pgiBy",
                    "pgiAtText"
                ].forEach(function (sField) {
                    if (oRow[sField]) {
                        oExisting[sField] = oRow[sField];
                    }
                });
            }.bind(this));

            if (!aRows.length && oHeaderDefaults && oHeaderDefaults.deliveryDoc) {
                aRows.push(this._normalizeDeliveryItem({}, oHeaderDefaults, sCurrency));
            }

            return aRows;
        },

        _buildDeliveryDetailData: function (oRow) {
            var oResolvedRow = this._resolveParentRow(oRow || {});
            var oBaseMeta = (oResolvedRow.quotationMeta && typeof oResolvedRow.quotationMeta === "object")
                ? oResolvedRow.quotationMeta
                : {};
            var oPayloadMeta = this._extractQuotationMetaFromPayload(oBaseMeta, oBaseMeta, oResolvedRow);
            var oMeta = this._mergeQuotationMeta(oBaseMeta, oPayloadMeta);

            var sPayloadText = this._firstFilledValue([oMeta.payload, oBaseMeta.payload]);
            var oPayloadObj = this._safeParseJsonObject(sPayloadText);
            var aResultRows = this._arrayFromNode(oPayloadObj && (oPayloadObj.results || oPayloadObj.EtResults || oPayloadObj.etResults));

            var sDeliveryDoc = this._firstFilledValue([
                oResolvedRow.delivery,
                oResolvedRow.deliveryDoc,
                oMeta.deliveryDoc
            ]);
            var sDeliveryLookup = String(sDeliveryDoc || "").trim().toUpperCase();

            var oMatchedResult = {};
            if (aResultRows.length) {
                oMatchedResult = aResultRows.find(function (oResultRow) {
                    var sResultDelivery = this._firstFilledValue([
                        oResultRow && oResultRow.deliveryDoc,
                        oResultRow && oResultRow.delivery,
                        oResultRow && oResultRow.DeliveryNo,
                        oResultRow && oResultRow.DeliveryDocument,
                        oResultRow && oResultRow.documentNo,
                        oResultRow && oResultRow.DocumentNo
                    ]);
                    var sResultLookup = String(sResultDelivery || "").trim().toUpperCase();
                    if (sDeliveryLookup && sResultLookup && sDeliveryLookup === sResultLookup) {
                        return true;
                    }

                    var sRequestIdRaw = this._firstFilledValue([oMeta.requestId, oResolvedRow.requestId]);
                    var sRequestLookup = String(sRequestIdRaw || "").trim().toUpperCase();
                    var sResultRequestRaw = this._firstFilledValue([
                        oResultRow && oResultRow.requestId,
                        oResultRow && oResultRow.requestID,
                        oResultRow && oResultRow.RequestId,
                        oResultRow && oResultRow.soReqId,
                        oResultRow && oResultRow.SoReqId,
                        oResultRow && oResultRow.purchNoC,
                        oResultRow && oResultRow.PurchNoC
                    ]);
                    var sResultRequest = String(sResultRequestRaw || "").trim().toUpperCase();
                    return !!(sRequestLookup && sResultRequest && sRequestLookup === sResultRequest);
                }.bind(this)) || aResultRows[0] || {};
            }

            var oHeaderDefaults = {
                deliveryDoc: this._firstFilledValue([
                    sDeliveryDoc,
                    oMatchedResult.deliveryDoc,
                    oMatchedResult.delivery,
                    oMatchedResult.DeliveryNo,
                    oMatchedResult.DeliveryDocument,
                    oMatchedResult.documentNo,
                    oMatchedResult.DocumentNo
                ]),
                deliveryStatus: this._firstFilledValue([
                    oMatchedResult.deliveryStatus,
                    oMatchedResult.DeliveryStatus,
                    oMeta.deliveryStatus,
                    oResolvedRow.statusText
                ]),
                pickingStatus: this._firstFilledValue([
                    oMatchedResult.pickingStatus,
                    oMatchedResult.PickingStatus,
                    oMatchedResult.pickStatus,
                    oMatchedResult.PickStatus,
                    oMeta.pickingStatus
                ]),
                pickingDate: this._formatMonitorDate(this._firstFilledValue([
                    oMatchedResult.pickingDate,
                    oMatchedResult.PickingDate,
                    oMatchedResult.pickDate,
                    oMatchedResult.PickDate,
                    oMeta.pickingDate
                ])),
                pickingBy: this._firstFilledValue([
                    oMatchedResult.pickingBy,
                    oMatchedResult.PickingBy,
                    oMatchedResult.pickBy,
                    oMatchedResult.PickBy,
                    oMeta.pickingBy
                ]),
                pgiStatus: this._firstFilledValue([
                    oMatchedResult.pgiStatus,
                    oMatchedResult.PGIStatus,
                    oMatchedResult.postGoodsIssueStatus,
                    oMatchedResult.PostGoodsIssueStatus,
                    oMeta.pgiStatus
                ]),
                pgiDate: this._formatMonitorDate(this._firstFilledValue([
                    oMatchedResult.pgiDate,
                    oMatchedResult.PGIDate,
                    oMatchedResult.postGoodsIssueDate,
                    oMatchedResult.PostGoodsIssueDate,
                    oMeta.pgiDate
                ])),
                pgiBy: this._firstFilledValue([
                    oMatchedResult.pgiBy,
                    oMatchedResult.PGIBy,
                    oMatchedResult.postGoodsIssueBy,
                    oMatchedResult.PostGoodsIssueBy,
                    oMeta.pgiBy
                ])
            };

            var sCurrency = this._firstFilledValue([oMeta.currency]);
            var aRawItems = this._extractResultItems(oMatchedResult);
            if (!aRawItems.length && Array.isArray(oMeta.items) && oMeta.items.length) {
                aRawItems = oMeta.items;
            }
            if (!aRawItems.length && Array.isArray(oResolvedRow.salesItemDetails) && oResolvedRow.salesItemDetails.length) {
                aRawItems = oResolvedRow.salesItemDetails;
            }

            var aItems = this._normalizeDeliveryItems(aRawItems, oHeaderDefaults, sCurrency);
            if (!aItems.length) {
                return null;
            }

            var sSalesOrder = this._firstFilledValue([oResolvedRow.salesOrder, oMeta.salesOrder]);
            var sQuotationNo = this._firstFilledValue([oResolvedRow.quotationNo, oMeta.quotationNo]);
            var sRequestId = this._firstFilledValue([oMeta.requestId, oResolvedRow.requestId]);
            var sCustomerId = this._firstFilledValue([oMeta.customerId, oMeta.soldTo, oResolvedRow.customerId]);
            var sCustomerName = this._firstFilledValue([oMeta.customerName, oMeta.soldToName, oResolvedRow.customerName]);
            var sCustomerDisplay = this._formatCustomerDisplay(sCustomerId, sCustomerName) || "N/A";

            var oPickingHeaderStatus = this._resolveExecutionStatus(oHeaderDefaults.pickingStatus, oHeaderDefaults.pickingDate);
            var oPgiHeaderStatus = this._resolveExecutionStatus(oHeaderDefaults.pgiStatus, oHeaderDefaults.pgiDate);

            var nItemCount = this._toDocNumber(this._firstFilledValue([
                oMeta.itemCount,
                oResolvedRow.itemCount,
                aItems.length
            ]));
            if (nItemCount <= 0) {
                nItemCount = aItems.length;
            }

            var sStatusText = this._resolveStatusText(oResolvedRow.statusCode, oResolvedRow.statusText);
            var sStatusState = sStatusText === "Completed"
                ? "Success"
                : (sStatusText === "Failed" ? "Error" : "Information");

            var sMessage = this._firstFilledValue([
                oMeta.message,
                oResolvedRow.reasonMessage,
                oResolvedRow.message
            ]);

            return {
                header: {
                    customerTitle: sCustomerDisplay,
                    customerSubTitle: "Delivery: " + (oHeaderDefaults.deliveryDoc || "N/A"),
                    referenceLine: this._buildHeaderLine([
                        sRequestId ? ("Request ID: " + sRequestId) : "",
                        sQuotationNo ? ("Quotation: " + sQuotationNo) : "",
                        sSalesOrder ? ("Sales Order: " + sSalesOrder) : ""
                    ]),
                    documentLine: this._buildHeaderLine([
                        oHeaderDefaults.deliveryDoc ? ("Delivery: " + oHeaderDefaults.deliveryDoc) : "",
                        oMeta.billingDoc ? ("Billing: " + oMeta.billingDoc) : "",
                        oHeaderDefaults.deliveryStatus ? ("Delivery Status: " + oHeaderDefaults.deliveryStatus) : ""
                    ]),
                    processLine: this._buildHeaderLine([
                        oResolvedRow.flowStage ? ("iFlow: " + oResolvedRow.flowStage) : "",
                        oMeta.callbackStep ? ("Callback: " + oMeta.callbackStep) : "",
                        oMeta.workflowInstanceId ? ("Workflow: " + oMeta.workflowInstanceId) : ""
                    ]),
                    warehouseLine: this._buildHeaderLine([
                        "Picking: " + oPickingHeaderStatus.text,
                        "Picking At: " + this._buildExecutionByText(oHeaderDefaults.pickingDate, oHeaderDefaults.pickingBy),
                        "PGI: " + oPgiHeaderStatus.text,
                        "PGI At: " + this._buildExecutionByText(oHeaderDefaults.pgiDate, oHeaderDefaults.pgiBy)
                    ]),
                    itemLine: "Items: " + nItemCount + (aItems.length !== nItemCount ? (" (showing " + aItems.length + ")") : ""),
                    messageLine: sMessage ? ("Message: " + sMessage) : "",
                    hasMessage: !!sMessage,
                    statusText: sStatusText,
                    statusState: sStatusState,
                    pickingStatusText: oPickingHeaderStatus.text,
                    pickingStatusState: oPickingHeaderStatus.state,
                    pgiStatusText: oPgiHeaderStatus.text,
                    pgiStatusState: oPgiHeaderStatus.state
                },
                items: aItems,
                deliveryDoc: oHeaderDefaults.deliveryDoc
            };
        },

        _ensureDeliveryDialog: function () {
            if (this._oDeliveryDialog) {
                return this._oDeliveryDialog;
            }

            this._oDeliveryDialog = new sap.m.Dialog({
                title: "Delivery Details",
                contentWidth: "1480px",
                contentHeight: "760px",
                stretchOnPhone: true,
                horizontalScrolling: true,
                verticalScrolling: true,
                content: new sap.m.VBox({
                    class: "sapUiMediumMargin",
                    items: [
                        new sap.m.HBox({
                            wrap: "Wrap",
                            class: "sapUiSmallMarginBottom",
                            items: [
                                new sap.m.VBox({
                                    width: "55%",
                                    class: "sapUiSmallMarginEnd",
                                    items: [
                                        new sap.m.Title({ text: "Delivery Overview", level: "H4" }),
                                        new sap.m.ObjectIdentifier({
                                            title: "{dialog>/header/customerTitle}",
                                            text: "{dialog>/header/customerSubTitle}"
                                        }),
                                        new sap.m.Text({ text: "{dialog>/header/referenceLine}", wrapping: true, visible: "{= !!${dialog>/header/referenceLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/documentLine}", wrapping: true, visible: "{= !!${dialog>/header/documentLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/processLine}", wrapping: true, visible: "{= !!${dialog>/header/processLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/warehouseLine}", wrapping: true, visible: "{= !!${dialog>/header/warehouseLine} }" })
                                    ]
                                }),
                                new sap.m.VBox({
                                    width: "42%",
                                    items: [
                                        new sap.m.Title({ text: "Execution Status", level: "H4" }),
                                        new sap.m.ObjectStatus({
                                            text: "{dialog>/header/statusText}",
                                            state: "{dialog>/header/statusState}",
                                            inverted: true
                                        }),
                                        new sap.m.ObjectStatus({
                                            text: "{= 'Picking: ' + ${dialog>/header/pickingStatusText} }",
                                            state: "{dialog>/header/pickingStatusState}"
                                        }),
                                        new sap.m.ObjectStatus({
                                            text: "{= 'PGI: ' + ${dialog>/header/pgiStatusText} }",
                                            state: "{dialog>/header/pgiStatusState}"
                                        }),
                                        new sap.m.Text({ text: "{dialog>/header/itemLine}", wrapping: true, visible: "{= !!${dialog>/header/itemLine} }" })
                                    ]
                                })
                            ]
                        }),
                        new sap.m.MessageStrip({
                            text: "{dialog>/header/messageLine}",
                            type: "Information",
                            showCloseButton: false,
                            visible: "{dialog>/header/hasMessage}",
                            class: "sapUiSmallMarginBottom"
                        }),
                        new sap.m.Toolbar({
                            content: [
                                new sap.m.Title({ text: "Delivery Line Items", level: "H5" }),
                                new sap.m.ToolbarSpacer(),
                                new sap.m.Text({ text: "{dialog>/header/itemLine}", visible: "{= !!${dialog>/header/itemLine} }" })
                            ]
                        }),
                        new sap.m.Table({
                            fixedLayout: false,
                            noDataText: "No delivery details available",
                            columns: [
                                new sap.m.Column({ header: new sap.m.Text({ text: "Delivery" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Item" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Material" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Qty / Unit" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Plant" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "SLoc" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Delivery Date" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Net Value" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Picking" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Picked At / By" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "PGI" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "PGI At / By" }) })
                            ],
                            items: {
                                path: "dialog>/items",
                                template: new sap.m.ColumnListItem({
                                    cells: [
                                        new sap.m.Text({ text: "{dialog>documentNo}" }),
                                        new sap.m.Text({ text: "{dialog>itemNo}" }),
                                        new sap.m.Text({ text: "{dialog>material}" }),
                                        new sap.m.Text({ text: "{dialog>description}" }),
                                        new sap.m.Text({ text: "{dialog>quantityText}" }),
                                        new sap.m.Text({ text: "{dialog>plant}" }),
                                        new sap.m.Text({ text: "{dialog>storageLocation}" }),
                                        new sap.m.Text({ text: "{dialog>deliveryDate}" }),
                                        new sap.m.Text({ text: "{dialog>valueText}" }),
                                        new sap.m.ObjectStatus({ text: "{dialog>pickingStatusText}", state: "{dialog>pickingStatusState}" }),
                                        new sap.m.Text({ text: "{dialog>pickingAtText}" }),
                                        new sap.m.ObjectStatus({ text: "{dialog>pgiStatusText}", state: "{dialog>pgiStatusState}" }),
                                        new sap.m.Text({ text: "{dialog>pgiAtText}" })
                                    ]
                                })
                            }
                        })
                    ]
                }),
                beginButton: new sap.m.Button({
                    text: "Close",
                    press: function () {
                        this._oDeliveryDialog.close();
                    }.bind(this)
                })
            });

            this.getView().addDependent(this._oDeliveryDialog);
            return this._oDeliveryDialog;
        },

        _ensureSalesOrderDialog: function () {
            if (this._oSalesOrderDialog) {
                return;
            }

            this._oSalesOrderDialog = new sap.m.Dialog({
                title: "Sales Order Details",
                contentWidth: "1420px",
                contentHeight: "720px",
                stretchOnPhone: true,
                horizontalScrolling: true,
                verticalScrolling: true,
                content: new sap.m.VBox({
                    class: "sapUiMediumMargin",
                    items: [
                        new sap.m.HBox({
                            wrap: "Wrap",
                            class: "sapUiSmallMarginBottom",
                            items: [
                                new sap.m.VBox({
                                    width: "50%",
                                    class: "sapUiSmallMarginEnd",
                                    items: [
                                        new sap.m.Title({ text: "Sales Order Overview", level: "H4" }),
                                        new sap.m.ObjectIdentifier({
                                            title: "{dialog>/header/customerTitle}",
                                            text: "{dialog>/header/customerSubTitle}"
                                        }),
                                        new sap.m.Text({ text: "{dialog>/header/referenceLine}", wrapping: true, visible: "{= !!${dialog>/header/referenceLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/partnerLine}", wrapping: true, visible: "{= !!${dialog>/header/partnerLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/orgLine}", wrapping: true, visible: "{= !!${dialog>/header/orgLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/financialLine}", wrapping: true, visible: "{= !!${dialog>/header/financialLine} }" })
                                    ]
                                }),
                                new sap.m.VBox({
                                    width: "47%",
                                    items: [
                                        new sap.m.Title({ text: "Processing Context", level: "H4" }),
                                        new sap.m.ObjectStatus({
                                            text: "{dialog>/header/statusText}",
                                            state: "{dialog>/header/statusState}",
                                            inverted: true
                                        }),
                                        new sap.m.Text({ text: "{dialog>/header/processLine}", wrapping: true, visible: "{= !!${dialog>/header/processLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/documentLine}", wrapping: true, visible: "{= !!${dialog>/header/documentLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/scheduleLine}", wrapping: true, visible: "{= !!${dialog>/header/scheduleLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/itemLine}", wrapping: true, visible: "{= !!${dialog>/header/itemLine} }" })
                                    ]
                                })
                            ]
                        }),
                        new sap.m.MessageStrip({
                            text: "{dialog>/header/messageLine}",
                            type: "Information",
                            showCloseButton: false,
                            visible: "{dialog>/header/hasMessage}",
                            class: "sapUiSmallMarginBottom"
                        }),
                        new sap.m.Toolbar({
                            content: [
                                new sap.m.Title({ text: "Sales Order Line Items", level: "H5" }),
                                new sap.m.ToolbarSpacer(),
                                new sap.m.Text({ text: "{dialog>/header/itemLine}", visible: "{= !!${dialog>/header/itemLine} }" })
                            ]
                        }),
                        new sap.m.Table({
                            fixedLayout: false,
                            noDataText: "No sales order line items available",
                            columns: [
                                new sap.m.Column({ header: new sap.m.Text({ text: "Item" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Category" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Material" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Qty / Unit" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Net Price" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Item Value" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Plant" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "SLoc" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Ship Point" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Req Date" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Ref Doc" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Ref Item" }) })
                            ],
                            items: {
                                path: "dialog>/list",
                                template: new sap.m.ColumnListItem({
                                    cells: [
                                        new sap.m.Text({ text: "{dialog>itemNo}" }),
                                        new sap.m.Text({ text: "{dialog>itemCateg}" }),
                                        new sap.m.Text({ text: "{dialog>material}" }),
                                        new sap.m.Text({ text: "{dialog>description}" }),
                                        new sap.m.Text({ text: "{dialog>quantityText}" }),
                                        new sap.m.Text({ text: "{dialog>netPrice}" }),
                                        new sap.m.Text({ text: "{dialog>valueText}" }),
                                        new sap.m.Text({ text: "{dialog>plant}" }),
                                        new sap.m.Text({ text: "{dialog>storageLocation}" }),
                                        new sap.m.Text({ text: "{dialog>shipPoint}" }),
                                        new sap.m.Text({ text: "{dialog>reqDate}" }),
                                        new sap.m.Text({ text: "{dialog>refDoc}" }),
                                        new sap.m.Text({ text: "{dialog>refItem}" })
                                    ]
                                })
                            }
                        })
                    ]
                }),
                beginButton: new sap.m.Button({
                    text: "Close",
                    press: function () {
                        this._oSalesOrderDialog.close();
                    }.bind(this)
                })
            });

            this.getView().addDependent(this._oSalesOrderDialog);
        },

        _getBusinessItemDetails: function (oRow) {
            var oResolvedRow = this._resolveParentRow(oRow || {});
            var oMeta = (oResolvedRow.quotationMeta && typeof oResolvedRow.quotationMeta === "object")
                ? oResolvedRow.quotationMeta
                : {};

            // Priority 1: Items from payload (latest data from CPI with full descriptions)
            var oPayloadMeta = this._extractQuotationMetaFromPayload(oMeta, oMeta, oResolvedRow);
            if (Array.isArray(oPayloadMeta.items) && oPayloadMeta.items.length) {
                return this._normalizeBusinessItems(oPayloadMeta.items);
            }

            // Priority 2: Items from quotationMeta (persisted in DB)
            if (Array.isArray(oMeta.items) && oMeta.items.length) {
                return this._normalizeBusinessItems(oMeta.items);
            }

            // Priority 3: salesItemDetails (fallback to saved normalized data)
            if (Array.isArray(oResolvedRow.salesItemDetails) && oResolvedRow.salesItemDetails.length) {
                return this._normalizeBusinessItems(oResolvedRow.salesItemDetails);
            }

            var sGroupId = String(oResolvedRow.groupId || oResolvedRow.parentGroupId || "").trim();
            if (!sGroupId) {
                return [];
            }

            var aChildItems = this._allRows
                .filter(function (oCandidate) {
                    return oCandidate && oCandidate.isChild && oCandidate.parentGroupId === sGroupId;
                })
                .map(function (oChild) {
                    var nQuantity = this._toDocNumber(oChild.quantity || 0);
                    var sUnit = this._pickDocField(oChild, ["unit"]);
                    return {
                        itemNo: this._pickDocField(oChild, ["itemNo", "lineNo"]),
                        material: this._pickDocField(oChild, ["material"]),
                        description: this._pickDocField(oChild, ["message", "description", "desc"]),
                        quantity: nQuantity,
                        unit: sUnit,
                        quantityText: this._buildQuantityText(nQuantity, sUnit),
                        plant: this._pickDocField(oChild, ["plant"]),
                        storageLocation: this._pickDocField(oChild, ["storLoc", "storageLocation"]),
                        deliveryDate: this._formatMonitorDate(this._pickDocField(oChild, ["deliveryDate"])),
                        valueText: this._pickDocField(oChild, ["total", "lineTotal", "netValue", "price"])
                    };
                }.bind(this));

            return this._normalizeBusinessItems(aChildItems);
        },

        _buildBusinessDocDetailRows: function (oRow, sDocField) {
            var aDocCodes = this._splitDocumentCodes(oRow && oRow[sDocField]);
            if (!aDocCodes.length) {
                return [];
            }

            var aItemDetails = this._getBusinessItemDetails(oRow);
            if (!aItemDetails.length) {
                return aDocCodes.map(function (sCode) {
                    return {
                        documentNo: sCode,
                        itemNo: "",
                        material: "",
                        description: "",
                        quantityText: "",
                        plant: "",
                        storageLocation: "",
                        deliveryDate: "",
                        valueText: ""
                    };
                });
            }

            var aRows = [];
            aDocCodes.forEach(function (sCode) {
                aItemDetails.forEach(function (oItem) {
                    aRows.push({
                        documentNo: sCode,
                        itemNo: oItem.itemNo,
                        material: oItem.material,
                        description: oItem.description,
                        quantityText: oItem.quantityText,
                        plant: oItem.plant,
                        storageLocation: oItem.storageLocation,
                        deliveryDate: oItem.deliveryDate,
                        valueText: oItem.valueText
                    });
                });
            });

            return aRows;
        },

        _ensureBusinessDocDialog: function () {
            if (this._oBusinessDocDialog) {
                return;
            }

            this._oBusinessDocDialog = new sap.m.Dialog({
                title: "Document Details",
                contentWidth: "1360px",
                contentHeight: "680px",
                stretchOnPhone: true,
                horizontalScrolling: true,
                verticalScrolling: true,
                content: new sap.m.Table({
                    fixedLayout: false,
                    columns: [
                        new sap.m.Column({ header: new sap.m.Text({ text: "Document No" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Item" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Material" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Qty / Unit" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Plant" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "SLoc" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Delivery Date" }) }),
                        new sap.m.Column({ header: new sap.m.Text({ text: "Net Value" }) })
                    ],
                    items: {
                        path: "dialog>/list",
                        template: new sap.m.ColumnListItem({
                            cells: [
                                new sap.m.Text({ text: "{dialog>documentNo}" }),
                                new sap.m.Text({ text: "{dialog>itemNo}" }),
                                new sap.m.Text({ text: "{dialog>material}" }),
                                new sap.m.Text({ text: "{dialog>description}" }),
                                new sap.m.Text({ text: "{dialog>quantityText}" }),
                                new sap.m.Text({ text: "{dialog>plant}" }),
                                new sap.m.Text({ text: "{dialog>storageLocation}" }),
                                new sap.m.Text({ text: "{dialog>deliveryDate}" }),
                                new sap.m.Text({ text: "{dialog>valueText}" })
                            ]
                        })
                    }
                }),
                beginButton: new sap.m.Button({
                    text: "Close",
                    press: function () {
                        this._oBusinessDocDialog.close();
                    }.bind(this)
                })
            });

            this.getView().addDependent(this._oBusinessDocDialog);
        },

        _openBusinessDocDetails: function (oEvent, sDocField, sTitle) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            if (!oContext) {
                return;
            }

            var oRow = this._resolveParentRow(oContext.getObject() || {});

            var aRows = this._buildBusinessDocDetailRows(oRow, sDocField);
            if (!aRows.length) {
                MessageToast.show("No " + sTitle + " details available");
                return;
            }

            this._ensureBusinessDocDialog();
            this._oBusinessDocDialog.setTitle(sTitle + " Details");
            this._oBusinessDocDialog.setModel(new sap.ui.model.json.JSONModel({ list: aRows }), "dialog");
            this._oBusinessDocDialog.open();
        },

        onShowSalesOrderDetails: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            if (!oContext) {
                return;
            }

            var oRow = this._resolveParentRow(oContext.getObject() || {});
            var oDetailData = this._buildSalesOrderDetailData(oRow);
            if (!oDetailData || !oDetailData.header) {
                MessageToast.show("No Sales Order details available");
                return;
            }

            if (!oDetailData.list || !oDetailData.list.length) {
                MessageToast.show("No sales order line items available. Showing header details only.");
            }

            this._ensureSalesOrderDialog();
            this._oSalesOrderDialog.setTitle("Sales Order " + (oDetailData.salesOrder || "N/A") + " Details");
            this._oSalesOrderDialog.setModel(new sap.ui.model.json.JSONModel({
                header: oDetailData.header,
                list: oDetailData.list || []
            }), "dialog");
            this._oSalesOrderDialog.open();
        },

        onShowDeliveryDetails: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            if (!oContext) {
                return;
            }

            var oRow = this._resolveParentRow(oContext.getObject() || {});
            var oData = this._buildDeliveryDetailData(oRow);
            if (!oData || !Array.isArray(oData.items) || !oData.items.length) {
                MessageToast.show("No Delivery details available");
                return;
            }

            var oDialog = this._ensureDeliveryDialog();
            oDialog.setModel(new sap.ui.model.json.JSONModel(oData), "dialog");
            oDialog.setTitle("Delivery " + (oData.deliveryDoc || "N/A") + " Details");
            oDialog.open();
        },

        _buildBillingDetailData: function (oRow) {
            var oResolvedRow = this._resolveParentRow(oRow || {});
            var oBaseMeta = (oResolvedRow.quotationMeta && typeof oResolvedRow.quotationMeta === "object")
                ? oResolvedRow.quotationMeta
                : {};
            var oPayloadMeta = this._extractQuotationMetaFromPayload(oBaseMeta, oBaseMeta, oResolvedRow);
            var oMeta = this._mergeQuotationMeta(oBaseMeta, oPayloadMeta);

            var sBillingDoc = this._firstFilledValue([
                oResolvedRow.billing,
                oResolvedRow.billingDoc,
                oMeta.billingDoc
            ]);
            var sBillingDate = this._formatMonitorDate(this._firstFilledValue([oMeta.billingDate, oResolvedRow.billingDate, oPayloadMeta.billingDate]));
            var sBillingType = this._firstFilledValue([oMeta.billingType, oResolvedRow.billingType, oPayloadMeta.billingType]);
            var sSalesOrder = this._firstFilledValue([oResolvedRow.salesOrder, oMeta.salesOrder]);
            var sDeliveryDoc = this._firstFilledValue([oResolvedRow.delivery, oResolvedRow.deliveryDoc, oMeta.deliveryDoc]);
            var sRequestId = this._firstFilledValue([oMeta.requestId, oResolvedRow.requestId]);
            var sCustomerId = this._firstFilledValue([oMeta.customerId, oMeta.soldTo, oResolvedRow.customerId]);
            var sCustomerName = this._firstFilledValue([oMeta.customerName, oMeta.soldToName, oResolvedRow.customerName]);
            var sCustomerDisplay = this._formatCustomerDisplay(sCustomerId, sCustomerName) || "N/A";

            var sCurrency = this._firstFilledValue([oMeta.currency]);
            var sNetValue = this._formatAmountWithCurrency(oMeta.netValue, sCurrency);
            var sTaxAmount = this._formatAmountWithCurrency(oMeta.taxAmount, sCurrency);
            var sGrossValue = this._formatAmountWithCurrency(oMeta.grossValue, sCurrency);
            var sTotalAmount = this._formatAmountWithCurrency(oMeta.totalAmount, sCurrency);
            var sCreatedBy = this._firstFilledValue([oMeta.createdBy]);
            var sCreatedAt = this._formatMonitorDateTime(this._firstFilledValue([oMeta.createdAt]));
            var sCallbackStep = this._firstFilledValue([oMeta.callbackStep]);
            var sWorkflowId = this._firstFilledValue([oMeta.workflowInstanceId]);
            var sMessage = this._firstFilledValue([
                oMeta.message,
                oResolvedRow.reasonMessage,
                oResolvedRow.message
            ]);

            var aRawItems = [];
            if (Array.isArray(oMeta.items) && oMeta.items.length) {
                aRawItems = oMeta.items;
            } else if (Array.isArray(oResolvedRow.salesItemDetails) && oResolvedRow.salesItemDetails.length) {
                aRawItems = oResolvedRow.salesItemDetails;
            }

            var aItemRows = this._normalizeBusinessItems(aRawItems).map(function (oItem) {
                var sItemCurrency = this._firstFilledValue([oItem.currency, sCurrency]);
                return {
                    documentNo: this._firstFilledValue([oItem.documentNo, sBillingDoc]),
                    itemNo: oItem.itemNo,
                    material: oItem.material,
                    description: oItem.description,
                    quantityText: oItem.quantityText,
                    plant: oItem.plant,
                    storageLocation: oItem.storageLocation,
                    billingDate: this._formatMonitorDate(this._firstFilledValue([oItem.billingDate, sBillingDate])),
                    billingType: this._firstFilledValue([oItem.billingType, sBillingType]),
                    netValueText: this._formatAmountWithCurrency(oItem.netValue || oItem.itemValue, sItemCurrency),
                    taxAmountText: this._formatAmountWithCurrency(oItem.taxAmount, sItemCurrency),
                    grossValueText: this._formatAmountWithCurrency(oItem.grossValue, sItemCurrency),
                    totalAmountText: this._formatAmountWithCurrency(oItem.totalAmount, sItemCurrency)
                };
            }.bind(this));

            var nItemCount = this._toDocNumber(this._firstFilledValue([
                oMeta.itemCount,
                oResolvedRow.itemCount,
                aItemRows.length
            ]));
            if (nItemCount <= 0) {
                nItemCount = aItemRows.length;
            }

            var sStatusText = this._resolveStatusText(oResolvedRow.statusCode, oResolvedRow.statusText);
            var sStatusState = sStatusText === "Completed"
                ? "Success"
                : (sStatusText === "Failed" ? "Error" : "Information");

            return {
                header: {
                    customerTitle: sCustomerDisplay,
                    customerSubTitle: "Billing: " + sBillingDoc,
                    referenceLine: this._buildHeaderLine([
                        sRequestId ? ("Request ID: " + sRequestId) : "",
                        sSalesOrder ? ("Sales Order: " + sSalesOrder) : "",
                        sDeliveryDoc ? ("Delivery: " + sDeliveryDoc) : ""
                    ]),
                    soldToLine: this._buildHeaderLine([
                        sCustomerId ? ("Sold-To ID: " + sCustomerId) : "",
                        sCustomerName ? ("Sold-To Name: " + sCustomerName) : ""
                    ]),
                    billingLine: this._buildHeaderLine([
                        sBillingDate ? ("Billing Date: " + sBillingDate) : "",
                        sBillingType ? ("Billing Type: " + sBillingType) : ""
                    ]),
                    financialLine: this._buildHeaderLine([
                        sNetValue ? ("Net: " + sNetValue) : "",
                        sTaxAmount ? ("Tax: " + sTaxAmount) : "",
                        sGrossValue ? ("Gross: " + sGrossValue) : "",
                        sTotalAmount ? ("Total: " + sTotalAmount) : ""
                    ]),
                    processLine: this._buildHeaderLine([
                        oResolvedRow.flowStage ? ("iFlow: " + oResolvedRow.flowStage) : "",
                        sCallbackStep ? ("Callback: " + sCallbackStep) : "",
                        sWorkflowId ? ("Workflow: " + sWorkflowId) : ""
                    ]),
                    documentLine: this._buildHeaderLine([
                        sSalesOrder ? ("Sales Order: " + sSalesOrder) : "",
                        sDeliveryDoc ? ("Delivery: " + sDeliveryDoc) : "",
                        sBillingDoc ? ("Billing: " + sBillingDoc) : ""
                    ]),
                    itemLine: nItemCount > 0 ? ("Items: " + nItemCount + (aItemRows.length !== nItemCount ? (" (showing " + aItemRows.length + ")") : "")) : "",
                    messageLine: sMessage ? ("Message: " + sMessage) : "",
                    hasMessage: !!sMessage,
                    statusText: sStatusText,
                    statusState: sStatusState,
                    createdLine: this._buildHeaderLine([
                        sCreatedAt ? ("Created At: " + sCreatedAt) : "",
                        sCreatedBy ? ("Created By: " + sCreatedBy) : ""
                    ])
                },
                list: aItemRows,
                billingDoc: sBillingDoc
            };
        },

        _ensureBillingDialog: function () {
            if (this._oBillingDialog) {
                return this._oBillingDialog;
            }

            this._oBillingDialog = new sap.m.Dialog({
                title: "Billing Details",
                contentWidth: "1600px",
                contentHeight: "760px",
                stretchOnPhone: true,
                horizontalScrolling: true,
                verticalScrolling: true,
                content: new sap.m.VBox({
                    class: "sapUiMediumMargin",
                    items: [
                        new sap.m.HBox({
                            wrap: "Wrap",
                            class: "sapUiSmallMarginBottom",
                            items: [
                                new sap.m.VBox({
                                    width: "55%",
                                    class: "sapUiSmallMarginEnd",
                                    items: [
                                        new sap.m.Title({ text: "Billing Overview", level: "H4" }),
                                        new sap.m.ObjectIdentifier({
                                            title: "{dialog>/header/customerTitle}",
                                            text: "{dialog>/header/customerSubTitle}"
                                        }),
                                        new sap.m.Text({ text: "{dialog>/header/referenceLine}", wrapping: true, visible: "{= !!${dialog>/header/referenceLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/soldToLine}", wrapping: true, visible: "{= !!${dialog>/header/soldToLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/billingLine}", wrapping: true, visible: "{= !!${dialog>/header/billingLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/documentLine}", wrapping: true, visible: "{= !!${dialog>/header/documentLine} }" })
                                    ]
                                }),
                                new sap.m.VBox({
                                    width: "42%",
                                    items: [
                                        new sap.m.Title({ text: "Execution Status", level: "H4" }),
                                        new sap.m.ObjectStatus({
                                            text: "{dialog>/header/statusText}",
                                            state: "{dialog>/header/statusState}",
                                            inverted: true
                                        }),
                                        new sap.m.Text({ text: "{dialog>/header/processLine}", wrapping: true, visible: "{= !!${dialog>/header/processLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/financialLine}", wrapping: true, visible: "{= !!${dialog>/header/financialLine} }" }),
                                        new sap.m.Text({ text: "{dialog>/header/itemLine}", wrapping: true, visible: "{= !!${dialog>/header/itemLine} }" })
                                    ]
                                })
                            ]
                        }),
                        new sap.m.MessageStrip({
                            text: "{dialog>/header/messageLine}",
                            type: "Information",
                            showCloseButton: false,
                            visible: "{dialog>/header/hasMessage}",
                            class: "sapUiSmallMarginBottom"
                        }),
                        new sap.m.Toolbar({
                            content: [
                                new sap.m.Title({ text: "Billing Line Items", level: "H5" }),
                                new sap.m.ToolbarSpacer(),
                                new sap.m.Text({ text: "{dialog>/header/itemLine}", visible: "{= !!${dialog>/header/itemLine} }" })
                            ]
                        }),
                        new sap.m.Table({
                            fixedLayout: false,
                            noDataText: "No billing item details available",
                            columns: [
                                new sap.m.Column({ header: new sap.m.Text({ text: "Billing Doc" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Item" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Material" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Billed Qty / Unit" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Plant" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "SLoc" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Billing Date" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Net Value" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Tax" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Gross" }) }),
                                new sap.m.Column({ header: new sap.m.Text({ text: "Total" }) })
                            ],
                            items: {
                                path: "dialog>/list",
                                template: new sap.m.ColumnListItem({
                                    cells: [
                                        new sap.m.Text({ text: "{dialog>documentNo}" }),
                                        new sap.m.Text({ text: "{dialog>itemNo}" }),
                                        new sap.m.Text({ text: "{dialog>material}" }),
                                        new sap.m.Text({ text: "{dialog>description}" }),
                                        new sap.m.Text({ text: "{dialog>quantityText}" }),
                                        new sap.m.Text({ text: "{dialog>plant}" }),
                                        new sap.m.Text({ text: "{dialog>storageLocation}" }),
                                        new sap.m.Text({ text: "{dialog>billingDate}" }),
                                        new sap.m.Text({ text: "{dialog>netValueText}" }),
                                        new sap.m.Text({ text: "{dialog>taxAmountText}" }),
                                        new sap.m.Text({ text: "{dialog>grossValueText}" }),
                                        new sap.m.Text({ text: "{dialog>totalAmountText}" })
                                    ]
                                })
                            }
                        })
                    ]
                }),
                beginButton: new sap.m.Button({
                    text: "Close",
                    press: function () {
                        this._oBillingDialog.close();
                    }.bind(this)
                })
            });

            this.getView().addDependent(this._oBillingDialog);
            return this._oBillingDialog;
        },

        onShowBillingDetails: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            if (!oContext) {
                return;
            }

            var oRow = this._resolveParentRow(oContext.getObject() || {});
            var oData = this._buildBillingDetailData(oRow);
            if (!oData) {
                MessageToast.show("No Billing details available");
                return;
            }

            if (!oData.list || !oData.list.length) {
                MessageToast.show("No billing item lines available. Showing header details only.");
            }

            var oDialog = this._ensureBillingDialog();
            oDialog.setModel(new sap.ui.model.json.JSONModel(oData), "dialog");
            oDialog.setTitle("Billing " + (oData.billingDoc || "N/A") + " Details");
            oDialog.open();
        },

        _ensureQuotationDialog: function () {
            if (this._oQuotationDialog) {
                return;
            }

            this._oQuotationDialog = new sap.m.Dialog({
                title: "Quotation Details",
                contentWidth: "1200px",
                contentHeight: "auto",
                resizable: true,
                draggable: true,
                stretchOnPhone: true,
                horizontalScrolling: false,
                verticalScrolling: true,
                class: "quotationDetailDialog",
                content: new sap.m.VBox({
                    class: "quotationDialogNew",
                    items: [
                        // ===== HEADER SECTION: Customer + Pricing =====
                        new sap.m.HBox({
                            class: "quotationHeaderRow",
                            justifyContent: "SpaceBetween",
                            wrap: "Wrap",
                            items: [
                                // Left: Customer Card
                                new sap.m.VBox({
                                    class: "quotationCard quotationCustomerCard",
                                    items: [
                                        new sap.m.HBox({
                                            class: "quotationCardHeader",
                                            items: [
                                                new sap.ui.core.Icon({ src: "sap-icon://customer", size: "1.25rem", color: "#4d8cdf" }),
                                                new sap.m.Title({ text: "Customer", level: "H5" })
                                            ]
                                        }),
                                        new sap.m.VBox({
                                            class: "quotationCardBody",
                                            items: [
                                                new sap.m.Text({ text: "{dialog>/header/customerName}", class: "quotationCustomerName" }),
                                                new sap.m.Text({ text: "{dialog>/header/customerCode}", class: "quotationCustomerCode" })
                                            ]
                                        })
                                    ]
                                }),
                                // Center: Document Info
                                new sap.m.VBox({
                                    class: "quotationCard quotationDocCard",
                                    items: [
                                        new sap.m.HBox({
                                            class: "quotationCardHeader",
                                            items: [
                                                new sap.ui.core.Icon({ src: "sap-icon://document-text", size: "1.25rem", color: "#1f6fd6" }),
                                                new sap.m.Title({ text: "Document Info", level: "H5" })
                                            ]
                                        }),
                                        new sap.m.VBox({
                                            class: "quotationCardBody",
                                            items: [
                                                new sap.m.HBox({
                                                    class: "quotationInfoRow",
                                                    items: [
                                                        new sap.m.Label({ text: "Quotation:" }),
                                                        new sap.m.Text({ text: "{dialog>/header/quotationNo}" })
                                                    ]
                                                }),
                                                new sap.m.HBox({
                                                    class: "quotationInfoRow",
                                                    items: [
                                                        new sap.m.Label({ text: "Valid From:" }),
                                                        new sap.m.Text({ text: "{dialog>/header/validFrom}" })
                                                    ]
                                                }),
                                                new sap.m.HBox({
                                                    class: "quotationInfoRow",
                                                    items: [
                                                        new sap.m.Label({ text: "Valid To:" }),
                                                        new sap.m.Text({ text: "{dialog>/header/validTo}" })
                                                    ]
                                                })
                                            ]
                                        })
                                    ]
                                }),
                                // Right: Pricing Summary Card
                                new sap.m.VBox({
                                    class: "quotationCard quotationPricingCard",
                                    visible: "{= !!${dialog>/header/netValueText} || !!${dialog>/header/taxValueText} || !!${dialog>/header/grossValueText} }",
                                    items: [
                                        new sap.m.HBox({
                                            class: "quotationCardHeader",
                                            items: [
                                                new sap.ui.core.Icon({ src: "sap-icon://money-bills", size: "1.25rem", color: "#0f8a73" }),
                                                new sap.m.Title({ text: "Pricing Summary", level: "H5" })
                                            ]
                                        }),
                                        new sap.m.VBox({
                                            class: "quotationCardBody",
                                            items: [
                                                new sap.m.HBox({
                                                    class: "quotationPriceRow",
                                                    items: [
                                                        new sap.m.Label({ text: "Net Value" }),
                                                        new sap.m.Text({ text: "{dialog>/header/netValueFormatted}", class: "quotationPriceValue" })
                                                    ]
                                                }),
                                                new sap.m.HBox({
                                                    class: "quotationPriceRow",
                                                    items: [
                                                        new sap.m.Label({ text: "Tax" }),
                                                        new sap.m.Text({ text: "{dialog>/header/taxValueFormatted}", class: "quotationPriceValue" })
                                                    ]
                                                }),
                                                new sap.m.HBox({
                                                    class: "quotationPriceRow quotationTotalRow",
                                                    items: [
                                                        new sap.m.Label({ text: "Total" }),
                                                        new sap.m.Text({ text: "{dialog>/header/grossValueFormatted}", class: "quotationPriceValue quotationTotalValue" })
                                                    ]
                                                })
                                            ]
                                        })
                                    ]
                                })
                            ]
                        }),
                        // ===== LINE ITEMS TABLE =====
                        new sap.m.VBox({
                            class: "quotationTableSection",
                            items: [
                                new sap.m.Toolbar({
                                    class: "quotationTableToolbar",
                                    content: [
                                        new sap.m.Title({ text: "Line Items", level: "H5" }),
                                        new sap.m.ToolbarSpacer(),
                                        new sap.m.Text({ text: "{dialog>/header/itemText}", visible: "{= !!${dialog>/header/itemText} }" })
                                    ]
                                }),
                                new sap.m.Table({
                                    class: "quotationItemsTable",
                                    fixedLayout: "Strict",
                                    noDataText: "No line items available",
                                    columns: [
                                        new sap.m.Column({ width: "12rem", header: new sap.m.Text({ text: "Material" }) }),
                                        new sap.m.Column({ minScreenWidth: "Tablet", header: new sap.m.Text({ text: "Description" }) }),
                                        new sap.m.Column({ width: "6rem", hAlign: "End", header: new sap.m.Text({ text: "Qty" }) }),
                                        new sap.m.Column({ width: "4rem", header: new sap.m.Text({ text: "Unit" }) }),
                                        new sap.m.Column({ width: "5rem", header: new sap.m.Text({ text: "Plant" }) }),
                                        new sap.m.Column({ width: "7rem", header: new sap.m.Text({ text: "Storage" }) }),
                                        new sap.m.Column({ width: "9rem", header: new sap.m.Text({ text: "Delivery" }) }),
                                        new sap.m.Column({ width: "12rem", hAlign: "End", header: new sap.m.Text({ text: "Net Price" }) })
                                    ],
                                    items: {
                                        path: "dialog>/list",
                                        template: new sap.m.ColumnListItem({
                                            cells: [
                                                new sap.m.Text({ text: "{dialog>material}" }),
                                                new sap.m.Text({ text: "{dialog>description}" }),
                                                new sap.m.ObjectNumber({ number: "{dialog>quantity}", emphasized: false }),
                                                new sap.m.Text({ text: "{dialog>unit}" }),
                                                new sap.m.Text({ text: "{dialog>plant}" }),
                                                new sap.m.Text({ text: "{dialog>storageLocation}" }),
                                                new sap.m.Text({ text: "{dialog>deliveryDate}" }),
                                                new sap.m.Text({ text: "{dialog>netPriceFormatted}", class: "quotationTablePrice" })
                                            ]
                                        })
                                    }
                                })
                            ]
                        })
                    ]
                }),
                beginButton: new sap.m.Button({
                    text: "Close",
                    type: "Emphasized",
                    press: function () {
                        this._oQuotationDialog.close();
                    }.bind(this)
                })
            });

            this.getView().addDependent(this._oQuotationDialog);
        },

        onShowQuotationDetails: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            if (!oContext) {
                return;
            }

            var oRow = this._resolveParentRow(oContext.getObject() || {});
            var aRows = this._getBusinessItemDetails(oRow);
            var oHeader = this._buildQuotationDetailHeader(oRow, aRows);

            if (!aRows.length) {
                MessageToast.show("No quotation item lines available. Showing header details only.");
            }

            this._ensureQuotationDialog();
            this._oQuotationDialog.setTitle("Quotation " + (oRow.quotationNo || "N/A") + " Details");
            this._oQuotationDialog.setModel(new sap.ui.model.json.JSONModel({
                header: oHeader,
                list: aRows
            }), "dialog");
            this._oQuotationDialog.open();
        },

        onShowPRList: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            var oRow = oContext.getObject();
            var oLists = this._normalizeProcurementLists(oRow.prList || [], oRow.poList || []);
            var aPRs = oLists.prs;

            if (!this._oPRDialog) {
                this._oPRDialog = new sap.m.Dialog({
                    title: "PR Details",
                    contentWidth: "1280px",
                    contentHeight: "650px",
                    stretchOnPhone: true,
                    horizontalScrolling: true,
                    verticalScrolling: true,
                    content: new sap.m.Table({
                        fixedLayout: false,
                        columns: [
                            new sap.m.Column({ header: new sap.m.Text({ text: "PR No" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "PR Item" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Material" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Qty / Unit" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Plant" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Vendor" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Purchasing" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Status" }) })
                        ],
                        items: {
                            path: "dialog>/list",
                            template: new sap.m.ColumnListItem({
                                cells: [
                                    new sap.m.Text({ text: "{dialog>prNo}" }),
                                    new sap.m.Text({ text: "{dialog>prItem}" }),
                                    new sap.m.Text({ text: "{dialog>material}" }),
                                    new sap.m.Text({ text: "{dialog>materialDesc}" }),
                                    new sap.m.Text({ text: "{dialog>quantityText}" }),
                                    new sap.m.Text({ text: "{dialog>plant}" }),
                                    new sap.m.Text({ text: "{dialog>vendorDisplay}" }),
                                    new sap.m.Text({ text: "{dialog>purchasingDisplay}" }),
                                    new sap.m.ObjectStatus({ text: "{dialog>statusText}", state: "{dialog>statusState}" })
                                ]
                            })
                        }
                    }),
                    beginButton: new sap.m.Button({
                        text: "Close",
                        press: function () {
                            this._oPRDialog.close();
                        }.bind(this)
                    })
                });
                this.getView().addDependent(this._oPRDialog);
            }

            if (!aPRs.length) {
                MessageToast.show("No PR details available");
            }

            var oDialogModel = new sap.ui.model.json.JSONModel({ list: aPRs });
            this._oPRDialog.setModel(oDialogModel, "dialog");
            this._oPRDialog.open();
        },

        onShowPOList: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            var oRow = oContext.getObject();
            var oLists = this._normalizeProcurementLists(oRow.prList || [], oRow.poList || []);
            var aPOs = oLists.pos;

            if (!this._oPODialog) {
                this._oPODialog = new sap.m.Dialog({
                    title: "PO Details",
                    contentWidth: "1320px",
                    contentHeight: "650px",
                    stretchOnPhone: true,
                    horizontalScrolling: true,
                    verticalScrolling: true,
                    content: new sap.m.Table({
                        fixedLayout: false,
                        columns: [
                            new sap.m.Column({ header: new sap.m.Text({ text: "PO No" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "PO Item" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "PR No" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "PR Item" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Material" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Description" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Qty / Unit" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Plant" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Vendor" }) }),
                            new sap.m.Column({ header: new sap.m.Text({ text: "Status" }) })
                        ],
                        items: {
                            path: "dialog>/list",
                            template: new sap.m.ColumnListItem({
                                cells: [
                                    new sap.m.Text({ text: "{dialog>poNo}" }),
                                    new sap.m.Text({ text: "{dialog>poItem}" }),
                                    new sap.m.Text({ text: "{dialog>prNo}" }),
                                    new sap.m.Text({ text: "{dialog>prItem}" }),
                                    new sap.m.Text({ text: "{dialog>material}" }),
                                    new sap.m.Text({ text: "{dialog>materialDesc}" }),
                                    new sap.m.Text({ text: "{dialog>quantityText}" }),
                                    new sap.m.Text({ text: "{dialog>plant}" }),
                                    new sap.m.Text({ text: "{dialog>vendorDisplay}" }),
                                    new sap.m.ObjectStatus({ text: "{dialog>statusText}", state: "{dialog>statusState}" })
                                ]
                            })
                        }
                    }),
                    beginButton: new sap.m.Button({
                        text: "Close",
                        press: function () {
                            this._oPODialog.close();
                        }.bind(this)
                    })
                });
                this.getView().addDependent(this._oPODialog);
            }

            if (!aPOs.length) {
                MessageToast.show("No PO details available");
            }

            var oDialogModel = new sap.ui.model.json.JSONModel({ list: aPOs });
            this._oPODialog.setModel(oDialogModel, "dialog");
            this._oPODialog.open();
        },

        onShowCustomerDetails: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            if (!oContext) {
                return;
            }
            var oRow = oContext.getObject();
            var sCustomer = oRow.customerDisplay || oRow.customerName || oRow.customerId || "N/A";

            var oDialog = this.byId("detailDialog");
            oDialog.setModel(new sap.ui.model.json.JSONModel({
                title: "Customer Details",
                content: sCustomer
            }), "detail");
            oDialog.open();
        },

        onShowMessageDetails: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            if (!oContext) {
                return;
            }
            var oRow = oContext.getObject();
            var sMessage = oRow.reasonMessage || oRow.message || "No message available";

            var oDialog = this.byId("detailDialog");
            oDialog.setModel(new sap.ui.model.json.JSONModel({
                title: "Message Details",
                content: sMessage
            }), "detail");
            oDialog.open();
        },

        onCloseDetailDialog: function () {
            this.byId("detailDialog").close();
        },

        // ========== TEMPLATE DOWNLOAD FUNCTIONS ==========
        onDownloadCSVTemplate: function (oEvent) {
            var that = this;
            var sFlowType = "sales"; // Default
            
            // Try to detect flowType from context or use sales as default
            if (oEvent && oEvent.getSource && oEvent.getSource().data) {
                sFlowType = oEvent.getSource().data("flowType") || "sales";
            }

            var oModel = this.getView().getModel();
            var sUrl = this._buildProcurementServiceUrl("getTemplate(flowType='" + sFlowType + "')");

            fetch(sUrl, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.value && data.value.content) {
                    that._downloadFile(
                        data.value.content,
                        data.value.fileName || "Quotation_Template_" + sFlowType + ".csv",
                        "text/csv"
                    );
                    sap.m.MessageToast.show("Template downloaded successfully!");
                } else {
                    sap.m.MessageToast.show("Failed to generate template");
                }
            })
            .catch(error => {
                console.error("Template download error:", error);
                sap.m.MessageToast.show("Error downloading template: " + error.message);
            });
        },

        onDownloadExcelTemplate: function (oEvent) {
            var that = this;
            var sFlowType = "sales"; // Default
            
            if (oEvent && oEvent.getSource && oEvent.getSource().data) {
                sFlowType = oEvent.getSource().data("flowType") || "sales";
            }

            // For Excel, we'll use the same CSV content (user can import CSV to Excel)
            var oModel = this.getView().getModel();
            var sUrl = this._buildProcurementServiceUrl("getTemplate(flowType='" + sFlowType + "')");

            fetch(sUrl, {
                method: "GET",
                headers: {
                    "Accept": "application/json",
                    "Content-Type": "application/json"
                }
            })
            .then(response => response.json())
            .then(data => {
                if (data && data.value && data.value.content) {
                    var sFileName = (data.value.fileName || "Quotation_Template_" + sFlowType + ".csv")
                        .replace(".csv", ".xlsx");
                    
                    that._downloadFile(
                        data.value.content,
                        sFileName,
                        "text/csv"
                    );
                    sap.m.MessageToast.show("Excel template downloaded successfully! (Imported as CSV)");
                } else {
                    sap.m.MessageToast.show("Failed to generate template");
                }
            })
            .catch(error => {
                console.error("Template download error:", error);
                sap.m.MessageToast.show("Error downloading template: " + error.message);
            });
        },

        _downloadFile: function (sContent, sFileName, sFileType) {
            var oBlob = new Blob([sContent], { type: sFileType || "text/plain" });
            var oUrl = window.URL.createObjectURL(oBlob);
            var oLink = document.createElement("a");
            oLink.href = oUrl;
            oLink.download = sFileName;
            document.body.appendChild(oLink);
            oLink.click();
            document.body.removeChild(oLink);
            window.URL.revokeObjectURL(oUrl);
        },

        onToggleQuotation: function (oEvent) {
            var oContext = oEvent.getSource().getBindingContext("monitor");
            if (!oContext) return;
            var oRow = oContext.getObject();
            if (!oRow || !oRow.isParent || !oRow.groupId) return;
            this._expandState[oRow.groupId] = !oRow.isExpanded;
            this._applyFilter();
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

        _loadData: function () {
            var that = this;

            if (this._isLoadingData) {
                return;
            }
            this._isLoadingData = true;

            this._fetchApiJson(this._buildProcurementServiceUrl("ProcessingQuotations?$orderby=updatedAt desc&$top=200"))
                .then(function (data) {
                    var aRecords = (data && data.value) ? data.value : [];
                    that._allRows = that._toRows(aRecords);
                    that._refreshSummary(that._allRows);
                    that._applyFilter();
                    that._lastLoadErrorAt = 0;

                    var oModel = that.getView().getModel("monitor");
                    oModel.setProperty("/lastUpdatedText", "Updated at " + DateUtils.formatDisplayDateTime(new Date()));
                })
                .catch(function (error) {
                    if (that._isSessionExpiredError(error)) {
                        that._stopAutoRefresh();

                        var oAppModel = that.getOwnerComponent() && that.getOwnerComponent().getModel("app");
                        if (oAppModel) {
                            oAppModel.setProperty("/isAuthenticated", false);
                            oAppModel.setProperty("/userName", "");
                            oAppModel.setProperty("/userEmail", "");
                            oAppModel.setProperty("/authRole", "");
                        }

                        try {
                            if (window && window.localStorage) {
                                window.localStorage.removeItem("po.procurement.staff.auth");
                            }
                        } catch (_e) {
                            // Ignore localStorage cleanup errors.
                        }

                        MessageToast.show("Session expired. Redirecting to login page...");
                        that.getRouter().navTo("login", {}, true);
                        return;
                    }

                    var iNow = Date.now();
                    if (!that._lastLoadErrorAt || (iNow - that._lastLoadErrorAt) > 60000) {
                        MessageToast.show("Unable to load quotation list: " + (error.message || "Unknown error"));
                        that._lastLoadErrorAt = iNow;
                    }
                })
                .finally(function () {
                    that._isLoadingData = false;
                });
        },

        _resolveStatusText: function (sStatusCode, sStatusText) {
            var sCode = String(sStatusCode || "").toUpperCase();

            if (sCode === "SUCCESS" || sCode === "COMPLETED" || sCode === "DONE") {
                return "Completed";
            }
            if (sCode === "ERROR" || sCode === "FAILED" || sCode === "FAIL" || sCode === "REJECTED") {
                return "Failed";
            }
            if (sCode === "PENDING" || sCode === "RUNNING" || sCode === "PROCESSING" || sCode === "IN_PROGRESS") {
                return "In Progress";
            }

            var sText = String(sStatusText || "").trim();
            if (!sText) {
                return "In Progress";
            }

            var sLower = sText.toLowerCase();
            if (sLower.indexOf("success") !== -1 || sLower.indexOf("completed") !== -1 || sLower.indexOf("hoan") !== -1 || sLower.indexOf("thanh cong") !== -1) {
                return "Completed";
            }
            if (sLower.indexOf("error") !== -1 || sLower.indexOf("failed") !== -1 || sLower.indexOf("loi") !== -1) {
                return "Failed";
            }
            if (sLower.indexOf("running") !== -1 || sLower.indexOf("processing") !== -1 || sLower.indexOf("pending") !== -1 || sLower.indexOf("dang") !== -1) {
                return "In Progress";
            }

            return sText;
        },

        _isMainDispatcherStage: function (sStage) {
            var sValue = String(sStage || "").trim().toLowerCase();
            if (!sValue) {
                return false;
            }

            return sValue.indexOf("main dispatcher") !== -1;
        },

        _isFakeQuotationCode: function (sQuotationNo, sBatchId) {
            var sQuotation = String(sQuotationNo || "").trim();
            if (!sQuotation) {
                return true;
            }

            var sUpper = sQuotation.toUpperCase();
            if (sUpper === "N/A" || sUpper === "UNKNOWN" || sUpper === "-") {
                return true;
            }

            if (/^REQ[0-9A-Z_-]*$/i.test(sQuotation)) {
                return true;
            }

            var sBatch = String(sBatchId || "").trim();
            if (sBatch && sUpper === sBatch.toUpperCase()) {
                return true;
            }

            // Batch-like tokens are usually long mixed alphanumeric IDs (not business quotation numbers).
            if (/^[A-Z0-9_-]{20,}$/i.test(sQuotation) && !/^\d+$/.test(sQuotation)) {
                return true;
            }

            return false;
        },

        _shouldDisplayMonitorRow: function (oRow) {
            var oData = oRow || {};
            if (this._isMainDispatcherStage(oData.flowStage)) {
                return false;
            }

            return !this._isFakeQuotationCode(oData.quotationNo, oData.batchId);
        },

        _toRows: function (aRecords) {
            var aRows = [];

            (aRecords || []).forEach(function (rec, idx) {
                var oItemsPayload = this._safeParseItemsJson(rec.itemsJson);
                var aItems = oItemsPayload.items || [];
                var aPrs = oItemsPayload.prs || [];
                var aPos = oItemsPayload.pos || [];

                var oContainerMeta = (oItemsPayload.raw && oItemsPayload.raw.quotationDetail && typeof oItemsPayload.raw.quotationDetail === "object")
                    ? oItemsPayload.raw.quotationDetail
                    : {};
                var oPayloadMeta = this._extractQuotationMetaFromPayload(oContainerMeta, oItemsPayload.raw, rec);
                var oQuotationMeta = this._mergeQuotationMeta(oContainerMeta, oPayloadMeta);

                if ((!aItems || !aItems.length) && Array.isArray(oQuotationMeta.items)) {
                    aItems = oQuotationMeta.items;
                }
                if ((!aItems || !aItems.length) && oItemsPayload.raw && Array.isArray(oItemsPayload.raw.items)) {
                    aItems = oItemsPayload.raw.items;
                }

                var oNormalizedLists = this._normalizeProcurementLists(aPrs, aPos);
                aPrs = oNormalizedLists.prs;
                aPos = oNormalizedLists.pos;
                // Prioritize items from payload (oQuotationMeta.items) over top-level items - they have detailed descriptions
                var aFinalItems = (oQuotationMeta.items && oQuotationMeta.items.length) ? oQuotationMeta.items : aItems;
                var aSalesItemDetails = this._normalizeBusinessItems(aFinalItems);

                var nItemCount = this._toDocNumber(this._firstFilledValue([
                    rec.totalItems,
                    oQuotationMeta.itemCount,
                    aSalesItemDetails.length,
                    aItems.length
                ]));
                if (nItemCount <= 0 && aSalesItemDetails.length) {
                    nItemCount = aSalesItemDetails.length;
                }

                if (nItemCount > 0 && !oQuotationMeta.itemCount) {
                    oQuotationMeta.itemCount = nItemCount;
                }
                if (!oQuotationMeta.items && Array.isArray(aItems) && aItems.length) {
                    oQuotationMeta.items = aItems;
                }

                var sGroupId = rec.ID || ("Q_" + idx);
                var sResolvedStatusText = this._resolveStatusText(rec.statusCode, rec.statusText);
                var sUploadAt = String(rec.uploadAt || rec.createdAt || "").trim();
                var sCompletedAt = String(rec.completedAt || "").trim();
                var sStatusCode = String(rec.statusCode || "PENDING").toUpperCase();
                if (!sCompletedAt && (sStatusCode === "SUCCESS" || sStatusCode === "COMPLETED")) {
                    sCompletedAt = String(rec.updatedAt || "").trim();
                }

                var sCustomerId = this._firstFilledValue([
                    rec.customerId,
                    oQuotationMeta.customerId,
                    oQuotationMeta.soldTo
                ]);
                var sCustomerName = this._firstFilledValue([
                    rec.customerName,
                    oQuotationMeta.customerName,
                    oQuotationMeta.soldToName
                ]);
                var sCustomerDisplay = this._formatCustomerDisplay(sCustomerId, sCustomerName);
                var sQuotationNo = this._firstFilledValue([rec.quotationNo, oQuotationMeta.quotationNo]) || "";
                var sRequestId = this._firstFilledValue([rec.requestId, oQuotationMeta.requestId]);
                var sPurchNoC = this._firstFilledValue([rec.purchNoC, oQuotationMeta.purchNoC]);
                var sFallbackForSort = sUploadAt || sCompletedAt || String(rec.updatedAt || rec.createdAt || "").trim();

                var oRowData = {
                    displayIndex: idx + 1,
                    quotationNo: sQuotationNo,
                    batchId: rec.batchId || "-",
                    itemCount: nItemCount,
                    requestId: sRequestId,
                    purchNoC: sPurchNoC,
                    customerId: sCustomerId,
                    customerName: sCustomerName,
                    customerDisplay: sCustomerDisplay || "-",
                    uploadMethod: rec.uploadMethod || "",
                    uploadType: oQuotationMeta.uploadType || rec.uploadType || rec.fileType || "",
                    uploadAt: sUploadAt,
                    uploadAtText: this._formatMonitorDateTime(sUploadAt),
                    uploadAtEpoch: this._toEpoch(sFallbackForSort),
                    completedAt: sCompletedAt,
                    completedAtText: this._formatMonitorDateTime(sCompletedAt),
                    salesOrder: this._firstFilledValue([rec.salesOrder, oQuotationMeta.salesOrder]),
                    delivery: rec.delivery || "",
                    billing: rec.billing || "",
                    statusCode: sStatusCode,
                    statusText: sResolvedStatusText,
                    message: rec.message || "",
                    reasonMessage: this._resolveReasonMessage(rec),
                    uploadedBy: rec.createdBy || "system",
                    flowStage: rec.currentStage || "",
                    prCount: aPrs.length,
                    poCount: aPos.length,
                    isParent: true,
                    groupId: sGroupId,
                    processType: rec.processType || "SD_OTC",
                    quotationMeta: oQuotationMeta,
                    salesItemDetails: aSalesItemDetails,
                    prList: aPrs,
                    poList: aPos
                };
                
                if (!this._shouldDisplayMonitorRow(oRowData)) {
                    return;
                }

                aRows.push(oRowData);
            }.bind(this));

            return aRows;
        },

        _matchesBatchFilter: function (oRow, sNeedle) {
            if (!sNeedle) return true;
            return String(oRow.batchId || "").trim().toLowerCase() === sNeedle;
        },

        _matchesQuotationFilter: function (oRow, sNeedle) {
            if (!sNeedle) return true;
            var aCandidates = [oRow.quotationNo, oRow.requestId, oRow.purchNoC];
            return aCandidates.some(function (vValue) {
                return String(vValue || "").toLowerCase().indexOf(sNeedle) !== -1;
            });
        },

        _matchesCustomerFilter: function (oRow, sNeedle) {
            if (!sNeedle) {
                return true;
            }

            var aCandidates = [oRow.customerDisplay, oRow.customerId, oRow.customerName];
            return aCandidates.some(function (vValue) {
                return String(vValue || "").toLowerCase().indexOf(sNeedle) !== -1;
            });
        },

        _matchesUploadedDateRange: function (oRow, oFromDate, oToDate) {
            if (!oFromDate && !oToDate) {
                return true;
            }

            var sUploadAt = String(oRow.uploadAt || "").trim();
            if (!sUploadAt) {
                return false;
            }

            var oUploadDate = DateUtils.parseDate(sUploadAt);
            if (!oUploadDate) {
                return false;
            }

            if (oFromDate && oUploadDate < oFromDate) {
                return false;
            }

            if (oToDate && oUploadDate > oToDate) {
                return false;
            }

            return true;
        },

        _matchesStatus: function (oRow, sFilterStatus) {
            var sCode = String(oRow.statusCode || "").toUpperCase();
            if (sFilterStatus === "ALL") return true;
            if (sFilterStatus === "SUCCESS") return (sCode === "COMPLETED" || sCode === "SUCCESS" || sCode === "DONE");
            if (sFilterStatus === "ERROR") return (sCode === "ERROR" || sCode === "FAILED" || sCode === "FAIL" || sCode === "REJECTED");
            if (sFilterStatus === "RUNNING") return (sCode === "PROCESSING" || sCode === "PENDING" || sCode === "RUNNING" || sCode === "IN_PROGRESS");
            return true;
        },

        _matchesUploadTypeFilter: function (oRow, sNeedle) {
            if (!sNeedle) return true;
            return String(oRow.uploadType || "").trim().toUpperCase() === sNeedle;
        },

        _applyFilter: function () {
            var oModel = this.getView().getModel("monitor");
            var sStatus = oModel.getProperty("/filterStatus") || "ALL";
            var sBatchNeedle = String(oModel.getProperty("/filterBatchId") || "").trim().toLowerCase();
            var sSalesNeedle = String(oModel.getProperty("/filterSalesOrder") || "").trim().toLowerCase();
            var sCustomerNeedle = String(oModel.getProperty("/filterCustomer") || "").trim().toLowerCase();
            var sUploadType = String(oModel.getProperty("/filterUploadType") || "").trim().toUpperCase();
            var oFromDate = this._parseFilterDate(oModel.getProperty("/filterUploadedFrom"), false);
            var oToDate = this._parseFilterDate(oModel.getProperty("/filterUploadedTo"), true);
            var sDateSort = String(oModel.getProperty("/filterDateSort") || "DESC").toUpperCase();

            var sActiveTab = oModel.getProperty("/activeTab") || "ALL";
            var aFiltered = this._allRows
                .filter(function (oRow) {
                    if (!oRow || !oRow.isParent) {
                        return false;
                    }
                    if (sActiveTab !== "ALL" && oRow.processType !== sActiveTab) {
                        return false;
                    }

                    return this._matchesStatus(oRow, sStatus)
                        && this._matchesBatchFilter(oRow, sBatchNeedle)
                        && this._matchesQuotationFilter(oRow, sSalesNeedle)
                        && this._matchesCustomerFilter(oRow, sCustomerNeedle)
                        && this._matchesUploadTypeFilter(oRow, sUploadType)
                        && this._matchesUploadedDateRange(oRow, oFromDate, oToDate);
                }.bind(this))
                .slice();

            aFiltered.sort(function (aRow, bRow) {
                var nA = Number(aRow.uploadAtEpoch || 0);
                var nB = Number(bRow.uploadAtEpoch || 0);

                if (nA !== nB) {
                    return sDateSort === "ASC" ? (nA - nB) : (nB - nA);
                }

                return String(aRow.quotationNo || "").localeCompare(String(bRow.quotationNo || ""), undefined, {
                    numeric: true,
                    sensitivity: "base"
                });
            });

            var aDisplayRows = aFiltered.map(function (oRow, iIndex) {
                return Object.assign({}, oRow, { displayIndex: iIndex + 1 });
            });

            oModel.setProperty("/rows", aDisplayRows);
        },

        _refreshSummary: function (aRecords) {
            var oModel = this.getView().getModel("monitor");
            var aRows = Array.isArray(aRecords) ? aRecords : [];

            var nRunning = aRows.filter(function (r) {
                var sCode = String(r.statusCode || "").toUpperCase();
                return sCode === "PENDING" || sCode === "RUNNING" || sCode === "PROCESSING" || sCode === "IN_PROGRESS";
            }).length;

            var nCompleted = aRows.filter(function (r) {
                var sCode = String(r.statusCode || "").toUpperCase();
                return sCode === "SUCCESS" || sCode === "COMPLETED" || sCode === "DONE";
            }).length;

            var nFailed = aRows.filter(function (r) {
                var sCode = String(r.statusCode || "").toUpperCase();
                return sCode === "ERROR" || sCode === "FAILED" || sCode === "FAIL" || sCode === "REJECTED";
            }).length;

            var mBatch = {};
            aRows.forEach(function (r) {
                var sBatch = String(r.batchId || "").trim();
                if (sBatch) {
                    mBatch[sBatch] = true;
                }
            });

            var nTotal = aRows.length;
            var nCompletionRate = nTotal > 0 ? Math.round((nCompleted / nTotal) * 100) : 0;

            oModel.setProperty("/totalQuotations", nTotal);
            oModel.setProperty("/runningQuotations", nRunning);
            oModel.setProperty("/completedQuotations", nCompleted);
            oModel.setProperty("/failedQuotations", nFailed);
            oModel.setProperty("/batchCount", Object.keys(mBatch).length);
            oModel.setProperty("/completionRateText", nCompletionRate + "%");

            // Calculate document metrics
            var nSalesOrders = aRows.filter(function(r) { return r.salesOrder && r.salesOrder !== "-"; }).length;
            var nDeliveryDocs = aRows.filter(function(r) { return r.delivery && r.delivery !== "-"; }).length;
            var nBillingDocs = aRows.filter(function(r) { return r.billing && r.billing !== "-"; }).length;
            var nPurchaseReqs = aRows.filter(function(r) { return r.prCount && r.prCount > 0; }).length;
            var nPurchaseOrders = aRows.filter(function(r) { return r.poCount && r.poCount > 0; }).length;

            oModel.setProperty("/totalSalesOrders", nSalesOrders);
            oModel.setProperty("/totalDeliveryDocs", nDeliveryDocs);
            oModel.setProperty("/totalBillingDocs", nBillingDocs);
            oModel.setProperty("/totalPurchaseReqs", nPurchaseReqs);
            oModel.setProperty("/totalPurchaseOrders", nPurchaseOrders);

            var aBatchOptions = [{ key: "", text: "All Batch IDs" }];
            Object.keys(mBatch)
                .sort(function (a, b) {
                    return b.localeCompare(a, undefined, { numeric: true, sensitivity: "base" });
                })
                .forEach(function (sBatchId) {
                    aBatchOptions.push({ key: sBatchId, text: sBatchId });
                });
            oModel.setProperty("/batchOptions", aBatchOptions);

            var sSelectedBatch = String(oModel.getProperty("/filterBatchId") || "").trim();
            if (sSelectedBatch && !mBatch[sSelectedBatch]) {
                oModel.setProperty("/filterBatchId", "");
            }

            // Populate customer dropdown options
            var mCustomers = {};
            aRows.forEach(function (r) {
                var sCustomer = String(r.customerDisplay || "").trim();
                if (sCustomer && sCustomer !== "-") {
                    mCustomers[sCustomer] = true;
                }
            });

            var aCustomerOptions = [{ key: "", text: "All Customers" }];
            Object.keys(mCustomers)
                .sort(function (a, b) {
                    return a.localeCompare(b, undefined, { sensitivity: "base" });
                })
                .forEach(function (sCustomer) {
                    aCustomerOptions.push({ key: sCustomer, text: sCustomer });
                });
            oModel.setProperty("/customerOptions", aCustomerOptions);

            var sSelectedCustomer = String(oModel.getProperty("/filterCustomer") || "").trim();
            if (sSelectedCustomer && !mCustomers[sSelectedCustomer]) {
                oModel.setProperty("/filterCustomer", "");
            }
        }
    });
});
