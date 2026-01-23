sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "com/gsp/sap/procurement/ui/poautomationui/model/models",
    "com/gsp/sap/procurement/ui/poautomationui/model/MockDataModel"
], (UIComponent, JSONModel, models, MockDataModel) => {
    "use strict";

    return UIComponent.extend("com.gsp.sap.procurement.ui.poautomationui.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // Call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // Set the device model
            this.setModel(models.createDeviceModel(), "device");

            // Create global app model for authentication
            const oAppModel = new JSONModel({
                authRole: "",
                isAuthenticated: false,
                userName: ""
            });
            this.setModel(oAppModel, "app");

            // Create global data model with mock data
            const oDataModel = MockDataModel.createDataModel();
            this.setModel(oDataModel, "data");

            // Enable routing
            this.getRouter().initialize();
        }
    });
});