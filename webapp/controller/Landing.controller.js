sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/routing/History"
], (Controller, History) => {
    "use strict";

    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.Landing", {

        onInit() {
            console.log("Landing Page initialized");
        },

        onLogoPress() {
            // Reload landing page
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("landing", {}, true);
        },

        onLoginPress() {
            // Navigate to Login page
            const oRouter = this.getOwnerComponent().getRouter();
            oRouter.navTo("login");
        }

    });
});