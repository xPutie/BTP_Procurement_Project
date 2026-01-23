sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], (Controller, JSONModel, MessageToast, MessageBox) => {
    "use strict";

    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.Approval", {

        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("approval").attachPatternMatched(this._onRouteMatched, this);
            
            // Initialize approval model
            this._initializeApprovalModel();
        },

        _onRouteMatched() {
            this._loadPendingOrders();
        },

        _initializeApprovalModel() {
            const oModel = new JSONModel({
                pendingOrders: [],
                selectedOrder: null,
                showRejectionInput: false,
                rejectionReason: ""
            });
            this.getView().setModel(oModel);
        },

        _loadPendingOrders() {
            // Load pending orders from global data model
            const oDataModel = this.getOwnerComponent().getModel("data");
            if (oDataModel) {
                const aPendingOrders = oDataModel.getProperty("/pendingOrders") || [];
                this.getView().getModel().setProperty("/pendingOrders", aPendingOrders);
            }
        },

        onOrderSelect(oEvent) {
            const oList = oEvent.getSource();
            const oSelectedItem = oEvent.getParameter("listItem");
            
            if (!oSelectedItem) {
                return;
            }
            
            const oContext = oSelectedItem.getBindingContext();
            const oSelectedOrder = oContext.getObject();
            
            // Set selected order
            this.getView().getModel().setProperty("/selectedOrder", oSelectedOrder);
            this.getView().getModel().setProperty("/showRejectionInput", false);
            this.getView().getModel().setProperty("/rejectionReason", "");
        },

        onApproveOrder() {
            const oModel = this.getView().getModel();
            const oSelectedOrder = oModel.getProperty("/selectedOrder");
            
            if (!oSelectedOrder) {
                MessageToast.show("Vui lòng chọn đơn hàng để duyệt");
                return;
            }
            
            MessageBox.confirm(
                "Bạn có chắc chắn muốn duyệt đơn hàng " + oSelectedOrder.orderCode + "?",
                {
                    title: "Xác nhận duyệt",
                    onClose: (oAction) => {
                        if (oAction === MessageBox.Action.OK) {
                            this._processApproval(oSelectedOrder, true);
                        }
                    }
                }
            );
        },

        onRejectOrder() {
            const oModel = this.getView().getModel();
            const oSelectedOrder = oModel.getProperty("/selectedOrder");
            const bShowRejectionInput = oModel.getProperty("/showRejectionInput");
            
            if (!oSelectedOrder) {
                MessageToast.show("Vui lòng chọn đơn hàng để từ chối");
                return;
            }
            
            if (!bShowRejectionInput) {
                // Show rejection reason input
                oModel.setProperty("/showRejectionInput", true);
                MessageToast.show("Vui lòng nhập lý do từ chối");
                return;
            }
            
            // Get rejection reason
            const sRejectionReason = oModel.getProperty("/rejectionReason");
            
            if (!sRejectionReason || sRejectionReason.trim() === "") {
                MessageToast.show("Vui lòng nhập lý do từ chối");
                return;
            }
            
            MessageBox.confirm(
                "Bạn có chắc chắn muốn từ chối đơn hàng " + oSelectedOrder.orderCode + "?",
                {
                    title: "Xác nhận từ chối",
                    onClose: (oAction) => {
                        if (oAction === MessageBox.Action.OK) {
                            this._processApproval(oSelectedOrder, false, sRejectionReason);
                        }
                    }
                }
            );
        },

        _processApproval(oOrder, bApproved, sRejectionReason) {
            const oDataModel = this.getOwnerComponent().getModel("data");
            
            // Update order status in pending orders
            let aPendingOrders = oDataModel.getProperty("/pendingOrders") || [];
            const iPendingIndex = aPendingOrders.findIndex((o) => {
                return o.orderCode === oOrder.orderCode;
            });
            
            if (iPendingIndex > -1) {
                // Remove from pending
                aPendingOrders.splice(iPendingIndex, 1);
                oDataModel.setProperty("/pendingOrders", aPendingOrders);
            }
            
            // Update upload history status
            let aUploadHistory = oDataModel.getProperty("/uploadHistory") || [];
            const iHistoryIndex = aUploadHistory.findIndex((h) => {
                return h.id === oOrder.uploadId;
            });
            
            if (iHistoryIndex > -1) {
                if (bApproved) {
                    aUploadHistory[iHistoryIndex].approvalText = "Đã duyệt";
                    aUploadHistory[iHistoryIndex].approvalState = "Success";
                    aUploadHistory[iHistoryIndex].statusText = "Thành công";
                    aUploadHistory[iHistoryIndex].statusState = "Success";
                    aUploadHistory[iHistoryIndex].rejectionReason = "";
                } else {
                    aUploadHistory[iHistoryIndex].approvalText = "Bị từ chối";
                    aUploadHistory[iHistoryIndex].approvalState = "Error";
                    aUploadHistory[iHistoryIndex].statusText = "Thất bại";
                    aUploadHistory[iHistoryIndex].statusState = "Error";
                    aUploadHistory[iHistoryIndex].rejectionReason = sRejectionReason || "";
                }
                oDataModel.setProperty("/uploadHistory", aUploadHistory);
            }
            
            // Refresh pending orders in view
            this._loadPendingOrders();
            
            // Clear selection
            this.getView().getModel().setProperty("/selectedOrder", null);
            this.getView().getModel().setProperty("/showRejectionInput", false);
            this.getView().getModel().setProperty("/rejectionReason", "");
            
            // Show success message
            const sMessage = bApproved 
                ? "Đã duyệt đơn hàng " + oOrder.orderCode 
                : "Đã từ chối đơn hàng " + oOrder.orderCode;
            MessageToast.show(sMessage);
        },

        onRefreshOrders() {
            this._loadPendingOrders();
            MessageToast.show("Đã làm mới danh sách đơn hàng");
        },

        onNavBack() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("landing");
        }

    });
});