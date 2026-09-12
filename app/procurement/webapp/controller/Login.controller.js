sap.ui.define([
    "./BaseController",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/m/MessageToast"
], function (BaseController, JSONModel, MessageBox, MessageToast) {
    "use strict";

    const AUTH_STORAGE_KEY = "po.procurement.staff.auth";

    return BaseController.extend("com.gsp.sap.procurement.ui.poautomationui.controller.Login", {
        onInit: function () {
            this.getView().setModel(new JSONModel({ isLogin: true, isBusy: false }), "auth");

            var oAppModel = this.getOwnerComponent().getModel("app");
            var bIsStaffLoggedIn = !!oAppModel.getProperty("/isAuthenticated")
                && String(oAppModel.getProperty("/authRole") || "").toLowerCase() === "staff";

            if (bIsStaffLoggedIn) {
                this.getOwnerComponent().getRouter().navTo("upload", {}, true);
            }
        },

        _setLoginBusy: function (bBusy) {
            var oAuthModel = this.getView().getModel("auth");
            if (oAuthModel) {
                oAuthModel.setProperty("/isBusy", !!bBusy);
            }

            var oButton = this.byId("idXCNHNNGNHPButton");
            if (oButton) {
                oButton.setBusy(!!bBusy);
                oButton.setEnabled(!bBusy);
            }
        },

        _persistStaffSession: function (oSession) {
            try {
                window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(oSession || {}));
            } catch (_e) {
                // Ignore localStorage issues and keep user logged in for current tab only.
            }
        },

        _getLoginActionCandidates: function () {
            return [
                "/procurement/srv-api/odata/v4/procurement/loginStaff",
                "/procurement/odata/v4/procurement/loginStaff",
                "/srv-api/odata/v4/procurement/loginStaff",
                "/odata/v4/procurement/loginStaff"
            ];
        },

        _buildLoginServiceRootCandidates: function () {
            var aRoots = this._getLoginActionCandidates().map(function (sActionUrl) {
                return String(sActionUrl || "").replace(/\/loginStaff$/i, "/");
            }).filter(Boolean);

            var mSeen = {};
            return aRoots.filter(function (sRoot) {
                if (mSeen[sRoot]) {
                    return false;
                }
                mSeen[sRoot] = true;
                return true;
            });
        },

        _extractCsrfTokenFromResponse: function (oResponse) {
            var sToken = oResponse && oResponse.headers && typeof oResponse.headers.get === "function"
                ? String(oResponse.headers.get("x-csrf-token") || "").trim()
                : "";

            if (!sToken || sToken.toLowerCase() === "required") {
                return "";
            }

            return sToken;
        },

        _fetchLoginCsrfToken: function () {
            var that = this;
            var aRoots = this._buildLoginServiceRootCandidates();
            var i = 0;

            var fnTryNext = function () {
                if (i >= aRoots.length) {
                    return Promise.resolve("");
                }

                var sRoot = aRoots[i++];

                return fetch(sRoot, that._buildApiRequestOptions({
                    method: "GET",
                    headers: {
                        "X-CSRF-Token": "Fetch"
                    }
                }))
                    .then(function (oResponse) {
                        var sToken = that._extractCsrfTokenFromResponse(oResponse);
                        if (sToken) {
                            return sToken;
                        }

                        return fnTryNext();
                    })
                    .catch(function () {
                        return fnTryNext();
                    });
            };

            return fnTryNext();
        },

        _executeStaffLogin: function (sUser, sPass) {
            var that = this;
            var aActionCandidates = this._getLoginActionCandidates();
            var sBody = JSON.stringify({
                username: sUser,
                password: sPass
            });

            var mHeaders = {
                "Content-Type": "application/json"
            };

            var fnSend = function (mExtraHeaders) {
                return that._fetchApiJsonWithFallback(aActionCandidates, {
                    method: "POST",
                    headers: Object.assign({}, mHeaders, mExtraHeaders || {}),
                    body: sBody
                });
            };

            return fnSend().catch(function (oError) {
                var iStatus = Number(oError && oError.httpStatus);
                var sMsg = String((oError && oError.message) || "").toLowerCase();
                var bLikelyCsrf = iStatus === 403 || sMsg.indexOf("csrf") !== -1;

                if (!bLikelyCsrf) {
                    throw oError;
                }

                return that._fetchLoginCsrfToken().then(function (sToken) {
                    if (!sToken) {
                        throw oError;
                    }

                    return fnSend({
                        "X-CSRF-Token": sToken
                    });
                });
            });
        },

        _forcePlatformReauth: function () {
            var oAppModel = this.getOwnerComponent().getModel("app");
            if (oAppModel) {
                oAppModel.setProperty("/isAuthenticated", false);
                oAppModel.setProperty("/userName", "");
                oAppModel.setProperty("/userEmail", "");
                oAppModel.setProperty("/authRole", "");
            }

            try {
                window.localStorage.removeItem(AUTH_STORAGE_KEY);
            } catch (_e) {
                // Ignore localStorage cleanup errors.
            }

            var oRouter = this.getOwnerComponent() && this.getOwnerComponent().getRouter();
            if (oRouter) {
                oRouter.navTo("login", {}, true);
                return;
            }

            if (window && window.location && typeof window.location.reload === "function") {
                window.location.reload();
            }
        },

        onXCNHNNGNHPButtonPress: function () {

            var sRawUser = this.byId("idUsernameInput").getValue();
            var sUser = sRawUser.trim().toLowerCase();
            var sPass = this.byId("idPasswordInput").getValue();

            // Check for spaces in username
            if (sRawUser.indexOf(" ") !== -1) {
                MessageBox.error("Username/Email cannot contain spaces.");
                return;
            }

            if (!sUser || !sPass) {
                MessageBox.error("Please enter both username and password.");
                return;
            }

            this._setLoginBusy(true);

            this._executeStaffLogin(sUser, sPass)
                .then(function (oResult) {
                    var oPayload = oResult && oResult.value && typeof oResult.value === "object"
                        ? oResult.value
                        : oResult;

                    if (!oPayload || oPayload.success !== true) {
                        throw new Error((oPayload && oPayload.message) || "Login failed. Invalid username or password.");
                    }

                    var sDisplayName = String(oPayload.fullName || oPayload.email || sUser);
                    var sEmail = String(oPayload.email || sUser);
                    var oAppModel = this.getOwnerComponent().getModel("app");

                    oAppModel.setProperty("/isAuthenticated", true);
                    oAppModel.setProperty("/userName", sDisplayName);
                    oAppModel.setProperty("/userEmail", sEmail);
                    oAppModel.setProperty("/authRole", "staff");

                    this._persistStaffSession({
                        isAuthenticated: true,
                        authRole: "staff",
                        userName: sDisplayName,
                        userEmail: sEmail,
                        savedAt: new Date().toISOString()
                    });

                    MessageToast.show("Login successful. Welcome " + sDisplayName + "!");

                    // Verify model is updated before navigation
                    console.log("[Login] Model updated - isAuthenticated:", oAppModel.getProperty("/isAuthenticated"), "authRole:", oAppModel.getProperty("/authRole"));

                    // Small delay to ensure model is synced
                    setTimeout(function() {
                        this.getOwnerComponent().getRouter().navTo("upload", {}, true);
                    }.bind(this), 100);
                }.bind(this))
                .catch(function (oError) {
                    if (this._isSessionExpiredError(oError)) {
                        MessageBox.error("Connection to authentication system is interrupted. Please try logging in again after a few seconds.");
                        return;
                    }

                    // Always show English message - backend returns Vietnamese
                    MessageBox.error("Invalid username or password.");
                }.bind(this))
                .finally(function () {
                    this._setLoginBusy(false);
                }.bind(this));
        },

        onNgKNgayLinkPress: function () {
            MessageBox.information("Password reset feature is not available in this version. Please contact your system administrator.");
        },

        onTrLiTrangChLinkPress: function () {
            this.getOwnerComponent().getRouter().navTo("login", {}, true);
        }
    });
});