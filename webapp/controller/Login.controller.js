sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageToast"
], (Controller, JSONModel, MessageToast) => {
    "use strict";

    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.Login", {

        onInit() {
            console.log("Login Page initialized");
        },

        onStandardLogin() {
            const oView = this.getView();
            const sUsername = oView.byId("inputUsername").getValue();
            const sPassword = oView.byId("inputPassword").getValue();

            if (!sUsername || !sPassword) {
                MessageToast.show("Vui lòng nhập đầy đủ thông tin đăng nhập");
                return;
            }

            // Mock standard login - default to Employee role
            MessageToast.show("Đăng nhập thành công với vai trò Nhân viên");
            this._setAuthRole("employee");
            this._navigateToRoleHome("employee");
        },

        onQuickLoginEmployee() {
            MessageToast.show("Đăng nhập Demo - Vai trò: Nhân viên");
            this._setAuthRole("employee");
            this._navigateToRoleHome("employee");
        },

        onQuickLoginManager() {
            MessageToast.show("Đăng nhập Demo - Vai trò: Quản lý");
            this._setAuthRole("manager");
            this._navigateToRoleHome("manager");
        },

        onQuickLoginAdmin() {
            MessageToast.show("Đăng nhập Demo - Vai trò: Quản trị viên");
            this._setAuthRole("admin");
            this._navigateToRoleHome("admin");
        },

        _setAuthRole(sRole) {
            // Set global auth model
            const oAppModel = this.getOwnerComponent().getModel("app");
            if (oAppModel) {
                oAppModel.setProperty("/authRole", sRole);
                oAppModel.setProperty("/isAuthenticated", true);
                oAppModel.setProperty("/userName", this._getUserNameByRole(sRole));
            }
        },

        _getUserNameByRole(sRole) {
            const mUserNames = {
                "employee": "Nguyễn Văn A",
                "manager": "Trần Thị B",
                "admin": "Lê Văn C"
            };
            return mUserNames[sRole] || "Demo User";
        },

        _navigateToRoleHome(sRole) {
            const oRouter = this.getOwnerComponent().getRouter();
            
            switch (sRole) {
                case "employee":
                    oRouter.navTo("upload");
                    break;
                case "manager":
                    oRouter.navTo("approval");
                    break;
                case "admin":
                    oRouter.navTo("admin");
                    break;
                default:
                    oRouter.navTo("landing");
            }
        },

        onBackToLanding() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("landing");
        },

        onRegisterPress() {
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("register");
        }

    });
});