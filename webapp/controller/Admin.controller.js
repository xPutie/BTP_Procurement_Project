sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], (Controller, JSONModel, MessageToast, MessageBox) => {
    "use strict";

    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.Admin", {

        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("admin").attachPatternMatched(this._onRouteMatched, this);
            
            // Initialize admin model
            this._initializeAdminModel();
        },

        _onRouteMatched() {
            this._loadDashboardData();
        },

        _initializeAdminModel() {
            const oModel = new JSONModel({
                kpi: {
                    totalOrders: 0,
                    approvedOrders: 0,
                    pendingOrders: 0,
                    rejectedOrders: 0,
                    mappingErrors: 0
                },
                systemLogs: [],
                allOrders: []
            });
            this.getView().setModel(oModel);
        },

        _loadDashboardData() {
            const oDataModel = this.getOwnerComponent().getModel("data");
            if (!oDataModel) {
                return;
            }
            
            // Calculate KPIs
            const aUploadHistory = oDataModel.getProperty("/uploadHistory") || [];
            const aPendingOrders = oDataModel.getProperty("/pendingOrders") || [];
            const aSystemLogs = oDataModel.getProperty("/systemLogs") || [];
            
            const iTotal = aUploadHistory.length;
            const iApproved = aUploadHistory.filter((h) => {
                return h.approvalState === "Success";
            }).length;
            const iPending = aPendingOrders.length;
            const iRejected = aUploadHistory.filter((h) => {
                return h.approvalState === "Error";
            }).length;
            const iMappingErrors = aSystemLogs.filter((l) => {
                return l.logType === "Mapping" && l.severityState === "Error";
            }).length;
            
            // Set KPI data
            const oModel = this.getView().getModel();
            oModel.setProperty("/kpi", {
                totalOrders: iTotal,
                approvedOrders: iApproved,
                pendingOrders: iPending,
                rejectedOrders: iRejected,
                mappingErrors: iMappingErrors
            });
            
            // Set system logs
            oModel.setProperty("/systemLogs", aSystemLogs);
            
            // Set all orders (combine upload history and pending)
            const aAllOrders = this._combineAllOrders(aUploadHistory, aPendingOrders);
            oModel.setProperty("/allOrders", aAllOrders);
        },

        _combineAllOrders(aUploadHistory, aPendingOrders) {
            const aAllOrders = [];
            
            // Add from upload history
            aUploadHistory.forEach((oHistory) => {
                aAllOrders.push({
                    orderCode: oHistory.id,
                    uploadTime: oHistory.uploadTime,
                    supplier: "Nhà cung cấp " + (Math.floor(Math.random() * 5) + 1),
                    uploadBy: "Nguyễn Văn A",
                    itemCount: oHistory.recordCount,
                    statusText: oHistory.approvalText,
                    statusState: oHistory.approvalState
                });
            });
            
            // Add from pending orders
            aPendingOrders.forEach((oOrder) => {
                aAllOrders.push({
                    orderCode: oOrder.orderCode,
                    uploadTime: oOrder.uploadTime,
                    supplier: oOrder.supplier,
                    uploadBy: oOrder.uploadBy,
                    itemCount: oOrder.itemCount,
                    statusText: "Chờ duyệt",
                    statusState: "Warning"
                });
            });
            
            // Sort by upload time descending
            aAllOrders.sort((a, b) => {
                return new Date(b.uploadTime) - new Date(a.uploadTime);
            });
            
            return aAllOrders;
        },

        onLogItemPress(oEvent) {
            const oItem = oEvent.getSource();
            const oContext = oItem.getBindingContext();
            const oLog = oContext.getObject();
            
            MessageBox.information(
                "Chi tiết Log:\n\n" +
                "Thời gian: " + oLog.logTime + "\n" +
                "Loại: " + oLog.logType + "\n" +
                "Mức độ: " + oLog.severity + "\n" +
                "Người dùng: " + oLog.userName + "\n" +
                "Thông báo: " + oLog.message + "\n" +
                "Thời lượng: " + oLog.duration,
                {
                    title: "Chi tiết System Log"
                }
            );
        },

        onViewOrderDetails(oEvent) {
            const oButton = oEvent.getSource();
            const oContext = oButton.getBindingContext();
            const oOrder = oContext.getObject();
            
            MessageBox.information(
                "Chi tiết đơn hàng:\n\n" +
                "Mã đơn hàng: " + oOrder.orderCode + "\n" +
                "Thời gian tạo: " + oOrder.uploadTime + "\n" +
                "Nhà cung cấp: " + oOrder.supplier + "\n" +
                "Tạo bởi: " + oOrder.uploadBy + "\n" +
                "Số linh kiện: " + oOrder.itemCount + "\n" +
                "Trạng thái: " + oOrder.statusText,
                {
                    title: "Chi tiết Đơn hàng"
                }
            );
        },

        onExportLogs() {
            MessageToast.show("Xuất System Logs thành công (chức năng demo)");
        },

        onRefreshDashboard() {
            this._loadDashboardData();
            MessageToast.show("Đã làm mới Dashboard");
        },

        onLogout() {
            // Clear auth
            const oAppModel = this.getOwnerComponent().getModel("app");
            if (oAppModel) {
                oAppModel.setProperty("/isAuthenticated", false);
                oAppModel.setProperty("/authRole", "");
            }
            
            // Navigate to landing
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("landing");
            
            MessageToast.show("Đã đăng xuất");
        },

        onNavBack() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("landing");
        }

    });
});