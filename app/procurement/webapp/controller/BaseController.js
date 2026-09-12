sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/core/UIComponent",
    "sap/m/library"
], function (Controller, UIComponent, mobileLibrary) {
    "use strict";

    /**
     * @class BaseController
     * @alias com.gsp.sap.procurement.ui.poautomationui.controller.BaseController
     * @extends sap.ui.core.mvc.Controller
     * @public
     */
    return Controller.extend("com.gsp.sap.procurement.ui.poautomationui.controller.BaseController", {
        /**
         * Convenience method for accessing the router.
         * @public
         * @returns {sap.ui.core.routing.Router} the router for this component
         */
        getRouter: function () {
            return UIComponent.getRouterFor(this);
        },

        /**
         * Convenience method for getting the view model by name.
         * @public
         * @param {string} [sName] the model name
         * @returns {sap.ui.model.Model} the model instance
         */
        getModel: function (sName) {
            return this.getView().getModel(sName);
        },

        /**
         * Convenience method for setting the view model.
         * @public
         * @param {sap.ui.model.Model} oModel the model instance
         * @param {string} sName the model name
         * @returns {sap.ui.mvc.View} the view instance
         */
        setModel: function (oModel, sName) {
            return this.getView().setModel(oModel, sName);
        },

        /**
         * Getter for the resource bundle.
         * @public
         * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
         */
        /**
         * Getter for the resource bundle.
         * @public
         * @returns {sap.ui.model.resource.ResourceModel} the resourceModel of the component
         */
        getResourceBundle: function () {
            return this.getOwnerComponent().getModel("i18n").getResourceBundle();
        },

        _buildApiRequestOptions: function (mOptions) {
            var mSafeOptions = Object.assign({
                credentials: "include"
            }, mOptions || {});

            var mHeaders = Object.assign({
                "Accept": "application/json",
                "X-Requested-With": "XMLHttpRequest"
            }, mSafeOptions.headers || {});

            mSafeOptions.headers = mHeaders;
            return mSafeOptions;
        },

        _extractApiErrorMessage: function (sText) {
            if (!sText) {
                return "";
            }

            try {
                var oPayload = JSON.parse(sText);
                if (oPayload && typeof oPayload.error === "string") {
                    return oPayload.error;
                }
                if (oPayload && oPayload.error && typeof oPayload.error.message === "string") {
                    return oPayload.error.message;
                }
                if (oPayload && oPayload.error && oPayload.error.message && typeof oPayload.error.message.value === "string") {
                    return oPayload.error.message.value;
                }
                if (oPayload && typeof oPayload.message === "string") {
                    return oPayload.message;
                }
            } catch (e) {
                // Not a JSON payload, ignore parse errors.
            }

            return "";
        },

        _isLikelySessionExpiredMessage: function (sMessage) {
            var sLower = String(sMessage || "").toLowerCase();
            if (!sLower) {
                return false;
            }

            return sLower.indexOf("phien dang nhap da het han") !== -1
                || sLower.indexOf("session expired") !== -1
                || sLower.indexOf("authentication required") !== -1;
        },

        _isLikelyAuthDeniedMessage: function (sMessage) {
            var sLower = String(sMessage || "").toLowerCase();
            if (!sLower) {
                return false;
            }

            return this._isLikelySessionExpiredMessage(sLower)
                || sLower.indexOf("not authenticated") !== -1
                || sLower.indexOf("login required") !== -1
                || sLower.indexOf("token expired") !== -1
                || sLower.indexOf("invalid token") !== -1;
        },

        _isLikelyPermissionDeniedMessage: function (sMessage) {
            var sLower = String(sMessage || "").toLowerCase();
            if (!sLower) {
                return false;
            }

            return sLower.indexOf("forbidden") !== -1
                || sLower.indexOf("unauthorized") !== -1
                || sLower.indexOf("not authorized") !== -1
                || sLower.indexOf("insufficient") !== -1
                || sLower.indexOf("permission") !== -1
                || sLower.indexOf("quyen") !== -1;
        },

            _isLoginStaffEndpoint: function (sUrl) {
                var sValue = String(sUrl || "").toLowerCase();
                return /\/loginstaff(?:$|\?|#)/i.test(sValue);
            },

        _isSessionExpiredError: function (oError) {
            if (!oError) {
                return false;
            }

            if (String(oError.code || "").toUpperCase() === "SESSION_EXPIRED") {
                return true;
            }

            var iStatus = Number(oError.httpStatus);
            if (iStatus === 401) {
                return this._isLikelySessionExpiredMessage(oError.message);
            }

            return this._isLikelySessionExpiredMessage(oError.message);
        },

        _fetchApiJson: function (sUrl, mOptions) {
            return fetch(sUrl, this._buildApiRequestOptions(mOptions))
                .then(function (response) {
                    var sContentType = "";
                    if (response.headers && typeof response.headers.get === "function") {
                        sContentType = String(response.headers.get("content-type") || "").toLowerCase();
                    }

                    return response.text().then(function (sBodyText) {
                        var sTrimmed = String(sBodyText || "").trim();
                        var bLooksLikeHtml = sContentType.indexOf("text/html") !== -1
                            || sContentType.indexOf("application/xhtml+xml") !== -1
                            || /^<!doctype html/i.test(sTrimmed)
                            || /^<html/i.test(sTrimmed);
                        var bLooksLikeJson = sContentType.indexOf("application/json") !== -1
                            || sTrimmed.indexOf("{") === 0
                            || sTrimmed.indexOf("[") === 0;
                        var sApiError = this._extractApiErrorMessage(sBodyText);
                        var sAuthProbe = [sApiError, sTrimmed].filter(Boolean).join(" ");

                        if (!response.ok) {
                            if (response.status === 401) {
                                if (this._isLoginStaffEndpoint(sUrl)) {
                                    var oLoginUnauthorized = new Error("Dang khong the xac thuc dich vu dang nhap. Vui long thu lai sau.");
                                    oLoginUnauthorized.code = "LOGIN_BACKEND_UNAUTHORIZED";
                                    oLoginUnauthorized.httpStatus = response.status;
                                    throw oLoginUnauthorized;
                                }

                                var oAuthError = new Error("Phien dang nhap da het han. Vui long dang nhap lai.");
                                oAuthError.code = "SESSION_EXPIRED";
                                oAuthError.httpStatus = response.status;
                                throw oAuthError;
                            }

                            if (response.status === 403 && (bLooksLikeHtml || this._isLikelyAuthDeniedMessage(sAuthProbe))) {
                                if (this._isLoginStaffEndpoint(sUrl)) {
                                    var oLoginForbidden = new Error("Dang khong the xac thuc dich vu dang nhap. Vui long thu lai sau.");
                                    oLoginForbidden.code = "LOGIN_BACKEND_UNAUTHORIZED";
                                    oLoginForbidden.httpStatus = response.status;
                                    throw oLoginForbidden;
                                }

                                var oForbiddenAuthError = new Error("Phien dang nhap da het han. Vui long dang nhap lai.");
                                oForbiddenAuthError.code = "SESSION_EXPIRED";
                                oForbiddenAuthError.httpStatus = response.status;
                                throw oForbiddenAuthError;
                            }

                            if (response.status === 403) {
                                if (sApiError) {
                                    if (this._isLikelyPermissionDeniedMessage(sApiError)) {
                                        throw new Error("Ban khong co quyen truy cap du lieu (HTTP 403).");
                                    }
                                    throw new Error(sApiError);
                                }

                                if (this._isLikelyPermissionDeniedMessage(sAuthProbe)) {
                                    throw new Error("Ban khong co quyen truy cap du lieu (HTTP 403).");
                                }

                                throw new Error("HTTP 403");
                            }

                            if (sApiError) {
                                throw new Error(sApiError);
                            }

                            throw new Error("HTTP " + response.status);
                        }

                        if (bLooksLikeHtml) {
                            var oHtmlError = new Error("Dich vu tra ve HTML thay vi JSON. Thuong do phien dang nhap da het han.");
                            oHtmlError.code = "SESSION_EXPIRED";
                            throw oHtmlError;
                        }

                        if (!sTrimmed) {
                            return {};
                        }

                        if (!bLooksLikeJson) {
                            throw new Error("Dich vu tra ve du lieu khong dung dinh dang JSON.");
                        }

                        try {
                            return JSON.parse(sTrimmed);
                        } catch (e) {
                            throw new Error("Khong phan tich duoc du lieu JSON tu dich vu.");
                        }
                    }.bind(this));
                }.bind(this));
        },

        _fetchApiJsonWithFallback: function (aUrls, mOptions) {
            var aCandidates = Array.isArray(aUrls) ? aUrls.slice() : [aUrls];
            aCandidates = aCandidates.filter(function (sUrl) {
                return !!sUrl;
            });

            if (aCandidates.length === 0) {
                return Promise.reject(new Error("Khong co endpoint API de goi."));
            }

            var i = 0;

            var fnAttempt = function () {
                var sUrl = aCandidates[i];
                return this._fetchApiJson(sUrl, mOptions)
                    .catch(function (oError) {
                        var sMessage = oError && oError.message ? String(oError.message) : "";
                        var bNotFound = sMessage.indexOf("HTTP 404") === 0;

                        if (bNotFound && i < aCandidates.length - 1) {
                            i += 1;
                            return fnAttempt();
                        }

                        throw oError;
                    });
            }.bind(this);

            return fnAttempt();
        },

        /**
         * Logic Đăng xuất toàn cục
         * @public
         */
        /**
         * Navigate to Register Page
         */
        onNgKButtonPress: function() {
             this.getOwnerComponent().getRouter().navTo("register");
        },

        /**
         * Navigate to Login Page
         */
        onNgNhpButtonPress: function() {
             this.getOwnerComponent().getRouter().navTo("login");
        },

        /**
         * Open User Profile Popover (Avatar)
         * @param {sap.ui.base.Event} oEvent 
         */
        onAvatarPress: function (oEvent) {
             const oSource = oEvent.getSource();
             this._openUserProfilePopover(oSource);
        },

        /**
         * Open User Profile Popover (Link)
         * @param {sap.ui.base.Event} oEvent 
         */
        onUserNameLinkPress: function (oEvent) {
             const oSource = oEvent.getSource();
             this._openUserProfilePopover(oSource);
        },

        _openUserProfilePopover: function(oSource) {
             // Create popover if not exists
             if (!this._oUserPopover) {
                 sap.ui.core.Fragment.load({
                     name: "com.gsp.sap.procurement.ui.poautomationui.view.fragments.UserProfile",
                     controller: this
                 }).then(function(oPopover){
                     this._oUserPopover = oPopover;
                     this.getView().addDependent(this._oUserPopover);
                     this._oUserPopover.openBy(oSource);
                 }.bind(this));
             } else {
                 this._oUserPopover.openBy(oSource);
             }
        },

        /**
         * Logic Đăng xuất an toàn (Secure Logout)
         * @public
         * @suppress {unused}
         */
        onNgXutAnTonButtonPress: function () {
            // 1. Show Busy Indicator (Security cleanup simulation)
            const oBusy = new sap.m.BusyDialog({
                 text: "Đang đăng xuất an toàn...",
                 customIcon: "sap-icon://shield",
                 customIconRotationSpeed: 1000
            });
            oBusy.open();

            setTimeout(() => {
                // 2. Lấy Model 'app' 
                const oAppModel = this.getOwnerComponent().getModel("app");

                // 3. Reset trạng thái đăng nhập
                oAppModel.setProperty("/isAuthenticated", false);
                oAppModel.setProperty("/userName", "");
                oAppModel.setProperty("/userEmail", "");
                oAppModel.setProperty("/authRole", "");

                try {
                    window.localStorage.removeItem("po.procurement.staff.auth");
                } catch (_e) {
                    // Ignore localStorage cleanup errors.
                }

                oBusy.close();

                // 4. Notify user
                sap.m.MessageToast.show("Logged out safely. See you again!");

                // 5. Dieu huong ve Login (Clear history)
                this.getRouter().navTo("login", {}, true);
            }, 800);
        }
    });
});
