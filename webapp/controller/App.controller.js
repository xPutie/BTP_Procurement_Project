sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.App", {

        onInit() {
            // Apply content density class based on device
            const oView = this.getView();
            const oComponent = this.getOwnerComponent();
            
            // Add content density class
            if (oComponent.getContentDensityClass) {
                oView.addStyleClass(oComponent.getContentDensityClass());
            }
        }

    });
});