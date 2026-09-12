sap.ui.define([
    "sap/ui/core/format/DateFormat",
    "sap/ui/core/format/NumberFormat",
    "../constants/AppConstants",
    "../util/DateUtils"
], function (DateFormat, NumberFormat, AppConstants, DateUtils) {
    "use strict";

    return {
        /**
         * Format number as Vietnamese currency (VND)
         * @param {string|number} sValue - Raw value
         * @param {string} sCurrency - Currency code (default: VND)
         * @param {boolean} bBold - Whether to apply bold styling
         * @returns {string} Formatted currency string
         */
        formatVND: function (sValue, sCurrency, bBold) {
            var nValue = parseFloat(sValue) || 0;
            if (nValue === 0) {
                return "0 " + (sCurrency || AppConstants.CURRENCY.DEFAULT);
            }

            // Format with Vietnamese thousand separator (.) and no decimal
            var sFormatted = nValue.toLocaleString("vi-VN", {
                minimumFractionDigits: 0,
                maximumFractionDigits: 0
            });

            return sFormatted + " " + (sCurrency || AppConstants.CURRENCY.DEFAULT);
        },

        /**
         * Format amount with currency symbol
         * @param {string|number} sAmount - Amount value
         * @param {string} sCurrency - Currency code
         * @returns {string} Formatted amount string
         */
        formatAmountWithCurrency: function (sAmount, sCurrency) {
            var nAmount = parseFloat(sAmount);
            if (isNaN(nAmount) || nAmount === 0) {
                return "";
            }

            var sCurr = (sCurrency || AppConstants.CURRENCY.DEFAULT).toUpperCase();
            
            // Format based on currency
            if (sCurr === "VND") {
                return this.formatVND(nAmount, sCurr);
            } else {
                var oFormatter = NumberFormat.getCurrencyInstance({
                    currencyCode: true,
                    showMeasure: true
                });
                return oFormatter.format(nAmount, sCurr);
            }
        },

        /**
         * Format date to display format
         * @param {string|Date} vDate - Date value
         * @param {string} sPattern - Date pattern (optional)
         * @returns {string} Formatted date string
         */
        formatDate: function (vDate, sPattern) {
            if (!vDate) {
                return "";
            }

            var oDateFormat = DateFormat.getDateInstance({
                pattern: sPattern || AppConstants.DATE_FORMAT.DISPLAY
            });

            var oParsed = this.parseDate(vDate);
            if (oParsed) {
                return oDateFormat.format(oParsed);
            }

            return String(vDate || "");
        },

        formatDateTime: function (vDate) {
            return DateUtils.formatDisplayDateTime(vDate) || String(vDate || "");
        },

        formatISODate: function (vDate) {
            return DateUtils.formatISODate(vDate);
        },

        formatSAPDate: function (vDate) {
            return DateUtils.formatSAPDate(vDate);
        },

        /**
         * Parse date string to Date object
         * @param {string} sDate - Date string
         * @returns {Date|null} Parsed date or null
         */
        parseDate: function (sDate) {
            return DateUtils.parseDate(sDate);
        },

        /**
         * Format quantity with unit
         * @param {number} nQuantity - Quantity value
         * @param {string} sUnit - Unit of measure
         * @returns {string} Formatted quantity string
         */
        formatQuantity: function (nQuantity, sUnit) {
            if (nQuantity === null || nQuantity === undefined || isNaN(nQuantity)) {
                return "";
            }

            var sFormatted = parseFloat(nQuantity).toLocaleString("vi-VN");
            
            if (sUnit) {
                return sFormatted + " " + sUnit;
            }
            
            return sFormatted;
        },

        /**
         * Format document number with leading zeros
         * @param {string|number} sDocNo - Document number
         * @param {number} nLength - Total length (default: 10)
         * @returns {string} Formatted document number
         */
        formatDocNumber: function (sDocNo, nLength) {
            if (!sDocNo) {
                return "";
            }

            var sDoc = String(sDocNo).trim();
            var nLen = nLength || 10;

            if (sDoc.length >= nLen) {
                return sDoc;
            }

            return sDoc.padStart(nLen, "0");
        },

        /**
         * Format customer display string
         * @param {string} sId - Customer ID
         * @param {string} sName - Customer name
         * @returns {string} Formatted customer string
         */
        formatCustomer: function (sId, sName) {
            var aParts = [];
            
            if (sName) {
                aParts.push(sName);
            }
            if (sId) {
                aParts.push("(" + sId + ")");
            }

            return aParts.join(" ");
        },

        /**
         * Format file size to human readable
         * @param {number} nBytes - Size in bytes
         * @returns {string} Formatted size string
         */
        formatFileSize: function (nBytes) {
            if (nBytes === 0 || nBytes === null || nBytes === undefined) {
                return "0 B";
            }

            var aUnits = ["B", "KB", "MB", "GB"];
            var nUnitIndex = 0;
            var nSize = nBytes;

            while (nSize >= 1024 && nUnitIndex < aUnits.length - 1) {
                nSize /= 1024;
                nUnitIndex++;
            }

            return nSize.toFixed(2) + " " + aUnits[nUnitIndex];
        },

        /**
         * Format status with state
         * @param {string} sStatus - Status text
         * @returns {object} Status object with text and state
         */
        formatStatus: function (sStatus) {
            var sStatusUpper = String(sStatus || "").toUpperCase();
            var sState = "None";

            if (sStatusUpper === "COMPLETED" || sStatusUpper === "SUCCESS") {
                sState = "Success";
            } else if (sStatusUpper === "ERROR" || sStatusUpper === "FAILED") {
                sState = "Error";
            } else if (sStatusUpper === "PENDING" || sStatusUpper === "PROCESSING" || sStatusUpper === "RUNNING") {
                sState = "Information";
            } else if (sStatusUpper === "WARNING" || sStatusUpper === "CANCELLED") {
                sState = "Warning";
            }

            return {
                text: sState === "Error" ? "Failed" : (sStatus || "Unknown"),
                state: sState
            };
        },

        /**
         * Format flow type to display name
         * @param {string} sFlowType - Raw flow type
         * @returns {string} Normalized flow type
         */
        normalizeFlowType: function (sFlowType) {
            var sRaw = String(sFlowType || "").trim().toUpperCase();
            
            if (!sRaw) {
                return "";
            }

            if (sRaw === "SALES" || sRaw === "ORDER-TO-CASH" || sRaw === "O2C" || sRaw === "ORDERTOCASH") {
                return "Order-to-Cash";
            }
            
            if (sRaw === "PROCUREMENT" || sRaw === "MAKE-TO-ORDER" || sRaw === "MTO" || sRaw === "MAKETOORDER") {
                return "Make-to-Order";
            }

            return sFlowType;
        },

        /**
         * Format phone number
         * @param {string} sPhone - Raw phone number
         * @returns {string} Formatted phone number
         */
        formatPhone: function (sPhone) {
            if (!sPhone) {
                return "";
            }

            var sClean = String(sPhone).replace(/\D/g, "");
            
            if (sClean.length === 10) {
                return sClean.replace(/(\d{4})(\d{3})(\d{3})/, "$1 $2 $3");
            } else if (sClean.length === 11) {
                return sClean.replace(/(\d{5})(\d{3})(\d{3})/, "$1 $2 $3");
            }

            return sPhone;
        },

        /**
         * Truncate text with ellipsis
         * @param {string} sText - Original text
         * @param {number} nLength - Max length
         * @returns {string} Truncated text
         */
        truncate: function (sText, nLength) {
            if (!sText) {
                return "";
            }

            var sStr = String(sText);
            if (sStr.length <= nLength) {
                return sStr;
            }

            return sStr.substring(0, nLength - 3) + "...";
        },

        /**
         * Capitalize first letter
         * @param {string} sText - Input text
         * @returns {string} Capitalized text
         */
        capitalize: function (sText) {
            if (!sText) {
                return "";
            }

            return String(sText).charAt(0).toUpperCase() + String(sText).slice(1).toLowerCase();
        }
    };
});
