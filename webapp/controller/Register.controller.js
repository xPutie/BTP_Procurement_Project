sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast",
    "sap/m/MessageBox"
], (Controller, MessageToast, MessageBox) => {
    "use strict";

    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.Register", {

        onInit() {
            console.log("Register Page initialized");
        },

        onRegister() {
            const oView = this.getView();
            const sFullName = oView.byId("inputFullName").getValue();
            const sEmail = oView.byId("inputEmail").getValue();
            const sUsername = oView.byId("inputRegUsername").getValue();
            const sPassword = oView.byId("inputRegPassword").getValue();
            const sConfirmPassword = oView.byId("inputConfirmPassword").getValue();
            const sRole = oView.byId("selectRole").getSelectedKey();

            // Validation
            if (!sFullName || !sEmail || !sUsername || !sPassword || !sConfirmPassword) {
                MessageBox.error("Vui lòng điền đầy đủ thông tin bắt buộc!");
                return;
            }

            if (sPassword !== sConfirmPassword) {
                MessageBox.error("Mật khẩu xác nhận không khớp!");
                return;
            }

            if (sPassword.length < 8) {
                MessageBox.error("Mật khẩu phải có ít nhất 8 ký tự!");
                return;
            }

            // Email validation
            const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailPattern.test(sEmail)) {
                MessageBox.error("Email không hợp lệ!");
                return;
            }

            // Mock registration success
            MessageBox.success(
                `Đăng ký thành công!\n\nHọ tên: ${sFullName}\nEmail: ${sEmail}\nVai trò: ${sRole === 'employee' ? 'Nhân viên' : 'Quản lý'}`,
                {
                    title: "Đăng ký thành công",
                    onClose: () => {
                        // Navigate to login page
                        const oRouter = this.getOwnerComponent().getRouter();
                        oRouter.navTo("login");
                    }
                }
            );
        },

        onBackToLogin() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("login");
        }

    });
});