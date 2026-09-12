sap.ui.define([], function () {
    "use strict";

    var DISPLAY_DATE = "dd/MM/yyyy";
    var DISPLAY_DATE_TIME = "dd/MM/yyyy HH:mm:ss";
    var ISO_DATE = "yyyy-MM-dd";
    var SAP_DATE = "yyyyMMdd";

    function pad2(vValue) {
        return String(vValue).padStart(2, "0");
    }

    function normalizeYear(nYear) {
        if (nYear < 100) {
            return nYear >= 50 ? 1900 + nYear : 2000 + nYear;
        }
        return nYear;
    }

    function buildDate(nYear, nMonth, nDay, nHour, nMinute, nSecond, nMs) {
        var iYear = Number(nYear);
        var iMonth = Number(nMonth);
        var iDay = Number(nDay);
        var iHour = Number(nHour || 0);
        var iMinute = Number(nMinute || 0);
        var iSecond = Number(nSecond || 0);
        var iMs = Number(nMs || 0);

        if (!Number.isFinite(iYear) || !Number.isFinite(iMonth) || !Number.isFinite(iDay)) {
            return null;
        }

        iYear = normalizeYear(iYear);

        var oDate = new Date(iYear, iMonth - 1, iDay, iHour, iMinute, iSecond, iMs);
        if (
            oDate.getFullYear() !== iYear ||
            (oDate.getMonth() + 1) !== iMonth ||
            oDate.getDate() !== iDay ||
            oDate.getHours() !== iHour ||
            oDate.getMinutes() !== iMinute ||
            oDate.getSeconds() !== iSecond
        ) {
            return null;
        }

        return oDate;
    }

    function parseTimeParts(sHour, sMinute, sSecond, sMs) {
        return {
            hour: sHour === undefined ? 0 : Number(sHour),
            minute: sMinute === undefined ? 0 : Number(sMinute),
            second: sSecond === undefined ? 0 : Number(sSecond),
            ms: sMs === undefined ? 0 : Number(String(sMs).padEnd(3, "0").slice(0, 3))
        };
    }

    function parseExcelSerial(nValue) {
        if (!Number.isFinite(nValue) || nValue <= 0 || nValue > 2958465) {
            return null;
        }

        var iWholeDays = Math.floor(nValue);
        var nDayFraction = nValue - iWholeDays;
        var oBase = new Date(1899, 11, 30);
        oBase.setDate(oBase.getDate() + iWholeDays);

        if (nDayFraction > 0) {
            oBase.setMilliseconds(Math.round(nDayFraction * 24 * 60 * 60 * 1000));
        }

        return oBase;
    }

    function parseDate(vValue) {
        if (vValue === null || vValue === undefined || vValue === "") {
            return null;
        }

        if (vValue instanceof Date) {
            return isNaN(vValue.getTime()) ? null : new Date(vValue.getTime());
        }

        if (typeof vValue === "number") {
            if (vValue > 100000000000) {
                var oTimestamp = new Date(vValue);
                return isNaN(oTimestamp.getTime()) ? null : oTimestamp;
            }
            return parseExcelSerial(vValue);
        }

        var sRaw = String(vValue).trim();
        if (!sRaw) {
            return null;
        }

        var aOData = sRaw.match(/^\/Date\((-?\d+)\)\/$/);
        if (aOData) {
            var oODataDate = new Date(Number(aOData[1]));
            return isNaN(oODataDate.getTime()) ? null : oODataDate;
        }

        if (/^\d+(\.\d+)?$/.test(sRaw)) {
            var nNumeric = Number(sRaw);
            var oExcelDate = parseExcelSerial(nNumeric);
            if (oExcelDate) {
                return oExcelDate;
            }
        }

        var aIsoWithOffset = sRaw.match(/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/);
        if (aIsoWithOffset) {
            var oOffsetDate = new Date(sRaw);
            return isNaN(oOffsetDate.getTime()) ? null : oOffsetDate;
        }

        var aIso = sRaw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2})(?:\.(\d{1,3}))?)?)?$/);
        if (aIso) {
            var tIso = parseTimeParts(aIso[4], aIso[5], aIso[6], aIso[7]);
            return buildDate(aIso[1], aIso[2], aIso[3], tIso.hour, tIso.minute, tIso.second, tIso.ms);
        }

        var aYmd = sRaw.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
        if (aYmd) {
            var tYmd = parseTimeParts(aYmd[4], aYmd[5], aYmd[6]);
            return buildDate(aYmd[1], aYmd[2], aYmd[3], tYmd.hour, tYmd.minute, tYmd.second, 0);
        }

        var aSapDateTime = sRaw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
        if (aSapDateTime) {
            return buildDate(aSapDateTime[1], aSapDateTime[2], aSapDateTime[3], aSapDateTime[4], aSapDateTime[5], aSapDateTime[6], 0);
        }

        var aSap = sRaw.match(/^(\d{4})(\d{2})(\d{2})$/);
        if (aSap) {
            return buildDate(aSap[1], aSap[2], aSap[3], 0, 0, 0, 0);
        }

        var aDmy = sRaw.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/);
        if (aDmy) {
            var tDmy = parseTimeParts(aDmy[4], aDmy[5], aDmy[6]);
            var oDmyDate = buildDate(aDmy[3], aDmy[2], aDmy[1], tDmy.hour, tDmy.minute, tDmy.second, 0);
            if (oDmyDate) {
                return oDmyDate;
            }

            return buildDate(aDmy[3], aDmy[1], aDmy[2], tDmy.hour, tDmy.minute, tDmy.second, 0);
        }

        var oNative = new Date(sRaw);
        return isNaN(oNative.getTime()) ? null : oNative;
    }

    function formatISODate(vValue) {
        var oDate = parseDate(vValue);
        if (!oDate) {
            return "";
        }
        return oDate.getFullYear() + "-" + pad2(oDate.getMonth() + 1) + "-" + pad2(oDate.getDate());
    }

    function formatDisplayDate(vValue) {
        var oDate = parseDate(vValue);
        if (!oDate) {
            return "";
        }
        return pad2(oDate.getDate()) + "/" + pad2(oDate.getMonth() + 1) + "/" + oDate.getFullYear();
    }

    function formatDisplayDateTime(vValue) {
        var oDate = parseDate(vValue);
        if (!oDate) {
            return "";
        }
        return formatDisplayDate(oDate) + " " + pad2(oDate.getHours()) + ":" + pad2(oDate.getMinutes()) + ":" + pad2(oDate.getSeconds());
    }

    function formatSAPDate(vValue) {
        var oDate = parseDate(vValue);
        if (!oDate) {
            return "";
        }
        return String(oDate.getFullYear()) + pad2(oDate.getMonth() + 1) + pad2(oDate.getDate());
    }

    function todayISODate() {
        return formatISODate(new Date());
    }

    function addMonths(vValue, nMonths) {
        var oDate = parseDate(vValue) || new Date();
        var oResult = new Date(oDate.getTime());
        oResult.setMonth(oResult.getMonth() + (Number(nMonths) || 0));
        return oResult;
    }

    function toEpoch(vValue) {
        var oDate = parseDate(vValue);
        return oDate ? oDate.getTime() : 0;
    }

    return {
        DISPLAY_DATE: DISPLAY_DATE,
        DISPLAY_DATE_TIME: DISPLAY_DATE_TIME,
        ISO_DATE: ISO_DATE,
        SAP_DATE: SAP_DATE,
        parseDate: parseDate,
        formatISODate: formatISODate,
        formatDisplayDate: formatDisplayDate,
        formatDisplayDateTime: formatDisplayDateTime,
        formatSAPDate: formatSAPDate,
        todayISODate: todayISODate,
        addMonths: addMonths,
        toEpoch: toEpoch
    };
});
