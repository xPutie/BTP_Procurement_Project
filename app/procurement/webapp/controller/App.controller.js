sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/m/MessageToast"
], (Controller, MessageToast) => {
    "use strict";

    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.App", {

        onInit() {
            // Áp dụng Content Density (Compact/Cozy)
            const oView = this.getView();
            const oComponent = this.getOwnerComponent();
            
            if (oComponent.getContentDensityClass) {
                const sClass = oComponent.getContentDensityClass();
                if (sClass) {
                    oView.addStyleClass(sClass);
                }
            }
        },

    });
});