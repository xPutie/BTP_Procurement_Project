sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast",
    "sap/m/BusyDialog",
    "sap/m/Dialog",          // Thêm mới để tạo hộp thoại tùy chỉnh
    "sap/m/FormattedText",   // Thêm mới để render HTML
    "sap/m/Button"           // Thêm mới cho nút đóng Dialog
], (Controller, JSONModel, MessageToast, BusyDialog, Dialog, FormattedText, Button) => {
    "use strict";

    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.Upload", {

        onInit() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.getRoute("upload").attachPatternMatched(this._onRouteMatched, this);
            this._initializeUploadHistoryModel();
        },

        _onRouteMatched() {
            this._loadUploadHistory();
        },

        _initializeUploadHistoryModel() {
            const oModel = new JSONModel({
                uploadHistory: []
            });
            this.getView().setModel(oModel);
            this._loadUploadHistory();
        },

        _loadUploadHistory() {
            const oDataModel = this.getOwnerComponent().getModel("data");
            if (oDataModel) {
                const aUploadHistory = oDataModel.getProperty("/uploadHistory") || [];
                this.getView().getModel().setProperty("/uploadHistory", aUploadHistory);
            }
        },

        onBeforeItemAdded(oEvent) {
            const oItem = oEvent.getParameter("item");
            const sFileName = oItem.getFileName();
            const sFileExtension = sFileName.split('.').pop().toLowerCase();

            if (sFileExtension !== "xlsx" && sFileExtension !== "xls") {
                MessageToast.show("Chỉ chấp nhận file Excel (.xlsx, .xls)");
                oEvent.preventDefault();
                return;
            }
            MessageToast.show("File đã được thêm: " + sFileName);
        },

        onProcessFile() {
            const oUploadSet = this.byId("uploadSetPO");
            const aIncompleteItems = oUploadSet.getIncompleteItems();

            if (aIncompleteItems.length === 0) {
                MessageToast.show("Vui lòng chọn file Excel để xử lý");
                return;
            }

            const oBusyDialog = new BusyDialog({
                title: "Đang xử lý file",
                text: "Hệ thống đang ánh xạ dữ liệu vào SAP HANA Cloud..."
            });
            oBusyDialog.open();

            setTimeout(() => {
                oBusyDialog.close();
                const oItem = aIncompleteItems[0];
                const sFileName = oItem.getFileName();
                const oValidationResult = this._generateValidationResult(sFileName);
                
                // GỌI HÀM HIỂN THỊ DIALOG MỚI
                this._showValidationResultDialog(oValidationResult);
                this._addUploadRecord(sFileName);
                oUploadSet.removeAllIncompleteItems();
            }, 2000);
        },

        _generateValidationResult(sFileName) {
            const iTotalRows = Math.floor(Math.random() * 50) + 10;
            const iValidRows = Math.floor(iTotalRows * 0.9);
            const iErrorRows = iTotalRows - iValidRows;
            
            return {
                fileName: sFileName,
                totalRows: iTotalRows,
                validRows: iValidRows,
                errorRows: iErrorRows,
                errors: iErrorRows > 0 ? [
                    { row: 5, message: "Thiếu cột 'Đơn giá'" },
                    { row: 12, message: "Mã nhà cung cấp không hợp lệ" },
                    { row: 18, message: "Số lượng phải là số nguyên dương" }
                ] : [],
                mappedColumns: ["Mã đơn hàng", "Nhà cung cấp", "Số lượng", "Đơn giá"]
            };
        },

        /**
         * FIX LỖI HIỂN THỊ HTML
         */
        _showValidationResultDialog(oResult) {
            const sHtml = `
                <div style="color: #333; font-family: Arial;">
                    <p><strong>Kết quả kiểm tra file:</strong> ${oResult.fileName}</p>
                    <p><strong>📊 Thống kê:</strong></p>
                    <ul>
                        <li>Tổng số dòng: <strong>${oResult.totalRows}</strong></li>
                        <li>Dòng hợp lệ: <span style="color: green; font-weight: bold;">${oResult.validRows}</span></li>
                        <li>Dòng lỗi: <span style="color: red; font-weight: bold;">${oResult.errorRows}</span></li>
                    </ul>
                    <p><strong>✅ Các cột đã mapping:</strong><br/>
                    ${oResult.mappedColumns.join(', ')}</p>
                    ${oResult.errors.length > 0 ? `
                        <p style="color: #d32f2f; font-weight: bold;">⚠️ Danh sách lỗi:</p>
                        <ul>
                            ${oResult.errors.map(err => `<li>Dòng ${err.row}: ${err.message}</li>`).join('')}
                        </ul>
                    ` : '<p style="color: green; font-weight: bold;">✓ Không có lỗi nào!</p>'}
                </div>
            `;

            if (!this._oResultDialog) {
                this._oResultDialog = new Dialog({
                    title: "Báo cáo Xử lý Dữ liệu",
                    type: "Message",
                    contentWidth: "450px",
                    content: new FormattedText({
                        htmlText: sHtml // Render HTML chính xác
                    }),
                    beginButton: new Button({
                        text: "Hoàn tất",
                        type: "Emphasized",
                        press: function () {
                            this._oResultDialog.close();
                            MessageToast.show("Đã lưu lịch sử upload");
                        }.bind(this)
                    })
                });
                this.getView().addDependent(this._oResultDialog);
            } else {
                // Cập nhật nội dung mới nếu dialog đã tồn tại
                this._oResultDialog.getContent()[0].setHtmlText(sHtml);
            }
            this._oResultDialog.open();
        },

        _addUploadRecord(sFileName) {
            const oModel = this.getView().getModel();
            let aHistory = oModel.getProperty("/uploadHistory") || [];
            const sTimestamp = this._formatDateTime(new Date());
            
            const oNewRecord = {
                id: "UPL" + Date.now(),
                fileName: sFileName,
                uploadTime: sTimestamp,
                recordCount: Math.floor(Math.random() * 50) + 10,
                statusText: "Đã xử lý",
                statusState: "Success",
                approvalText: "Chờ duyệt",
                approvalState: "Warning",
                rejectionReason: ""
            };
            
            aHistory.unshift(oNewRecord);
            oModel.setProperty("/uploadHistory", aHistory);
            
            const oDataModel = this.getOwnerComponent().getModel("data");
            if (oDataModel) {
                oDataModel.setProperty("/uploadHistory", aHistory);
            }
        },

        _formatDateTime(oDate) {
            return oDate.toISOString().replace('T', ' ').split('.')[0];
        },

        onRefresh() {
            this._loadUploadHistory();
            MessageToast.show("Dữ liệu đã được cập nhật");
        },

        onLogout() {
            this.getOwnerComponent().getRouter().navTo("login");
        },

        onNavBack() {
            this.getOwnerComponent().getRouter().navTo("landing");
        }
    });
});