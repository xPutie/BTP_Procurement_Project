sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel",
    "com/gsp/sap/procurement/ui/poautomationui/model/models",
    "com/gsp/sap/procurement/ui/poautomationui/model/MockDataModel"
], (UIComponent, JSONModel, models, MockDataModel) => {
    "use strict";

    const AUTH_STORAGE_KEY = "po.procurement.staff.auth";
    const MAX_STAFF_SESSION_AGE_MS = 12 * 60 * 60 * 1000;

    return UIComponent.extend("com.gsp.sap.procurement.ui.poautomationui.Component", {
        metadata: {
            manifest: "json",
            interfaces: ["sap.ui.core.IAsyncContentCreation"]
        },

        init() {
            UIComponent.prototype.init.apply(this, arguments);

            // Set the device model
            // @ts-ignore
            this.setModel(models["createDeviceModel"](), "device");

            // GLOBAL APP MODEL (Cái này để điều khiển Header/Footer)
            const oAppModel = new JSONModel({
                authRole: "",
                isAuthenticated: false, // Mặc định là false
                userName: "",
                userEmail: ""
            });
            this._restoreAuthSession(oAppModel);
            this.setModel(oAppModel, "app");

            this._attachStaffRouteGuard();

            // PERSISTENT UPLOAD MODEL
            // @ts-ignore
            this.setModel(models["createUploadModel"](), "uploadModel");

            // Mock Data Model - REMOVED for CAP Integration
            // const oDataModel = MockDataModel.createDataModel();
            // this.setModel(oDataModel, "data");

            this.getRouter().initialize();
        },

        _restoreAuthSession: function (oAppModel) {
            try {
                const sHost = String(window.location.hostname || "").toLowerCase();
                const bIsLocalHost = (sHost === "localhost" || sHost === "127.0.0.1");

                // Local development should always start from login to avoid confusing stale sessions.
                if (bIsLocalHost) {
                    window.localStorage.removeItem(AUTH_STORAGE_KEY);
                    return;
                }

                const sRaw = window.localStorage.getItem(AUTH_STORAGE_KEY);
                if (!sRaw) {
                    return;
                }

                const oSaved = JSON.parse(sRaw);
                const iSavedAt = Date.parse(String(oSaved && oSaved.savedAt || ""));
                const bExpired = !Number.isFinite(iSavedAt)
                    || ((Date.now() - iSavedAt) > MAX_STAFF_SESSION_AGE_MS);

                if (bExpired) {
                    window.localStorage.removeItem(AUTH_STORAGE_KEY);
                    return;
                }

                const bValidStaffSession = !!oSaved
                    && oSaved.isAuthenticated === true
                    && String(oSaved.authRole || "").toLowerCase() === "staff";

                if (bValidStaffSession) {
                    oAppModel.setData({
                        authRole: "staff",
                        isAuthenticated: true,
                        userName: String(oSaved.userName || ""),
                        userEmail: String(oSaved.userEmail || "")
                    });
                }
            } catch (_e) {
                // Ignore broken local session payload.
            }
        },

        _attachStaffRouteGuard: function () {
            const oRouter = this.getRouter();
            const aPublicRoutes = ["login", "loginRoot", "register"];
            const aRedirectToUploadWhenAuthenticated = ["login", "loginRoot", "landing", "landingHash", "register"];

            oRouter.attachRouteMatched(function (oEvent) {
                const sRouteName = String(oEvent.getParameter("name") || "");
                const oAppModel = this.getModel("app");
                const bAuthenticated = !!oAppModel.getProperty("/isAuthenticated");
                const sAuthRole = String(oAppModel.getProperty("/authRole") || "").toLowerCase();
                const bStaff = sAuthRole === "staff";
                const bAllowed = bAuthenticated && bStaff;
                const bPublicRoute = aPublicRoutes.indexOf(sRouteName) !== -1;

                console.log("[RouteGuard] Route:", sRouteName, "isAuth:", bAuthenticated, "authRole:", sAuthRole, "allowed:", bAllowed);

                if (!bAllowed && !bPublicRoute) {
                    console.log("[RouteGuard] Redirecting to login");
                    oRouter.navTo("login", {}, true);
                    return;
                }

                if (bAllowed && aRedirectToUploadWhenAuthenticated.indexOf(sRouteName) !== -1) {
                    console.log("[RouteGuard] Redirecting to upload");
                    oRouter.navTo("upload", {}, true);
                }
            }, this);
        },

        getContentDensityClass: function () {
            if (this._sContentDensityClass === undefined) {
                // check whether FLP is ready (as it offers content density settings)
                // and defaults to "sapUiSizeCozy"
                if (document.body.classList.contains("sapUiSizeCozy") || document.body.classList.contains("sapUiSizeCompact")) {
                    this._sContentDensityClass = "";
                } else if (!sap.ui.Device.support.touch) { // apply "compact" mode if touch is not supported
                    this._sContentDensityClass = "sapUiSizeCompact";
                } else {
                    // "cozy" (default) is applied implicitly
                    this._sContentDensityClass = "sapUiSizeCozy";
                }
            }
            return this._sContentDensityClass;
        }
    });
});