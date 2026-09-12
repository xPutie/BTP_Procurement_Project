const cds = require('@sap/cds');

const XLSX = require('xlsx');

const axios = require('axios');

const { randomUUID, pbkdf2Sync, timingSafeEqual } = require('crypto');



module.exports = cds.service.impl(async function () {

    const { Orders, OrderItems, ProcessingQuotations } = this.entities;

    const { StaffUsers } = cds.entities('com.gsp.sap.procurement');

    const formatDateOnly = (value = new Date()) => {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };



    // Bypass authentication for loginStaff action

    this.before('loginStaff', (req) => {

        req.user = req.user || { id: 'anonymous', is: () => true };

    });



    const normalizeStaffEmail = (value) => String(value || '').trim().toLowerCase();



    const verifyStaffPassword = (plainPassword, storedHash) => {

        const srcHash = String(storedHash || '');

        const parts = srcHash.split('$');



        if (parts.length !== 4 || parts[0] !== 'pbkdf2_sha512') {

            return false;

        }



        const iterations = Number(parts[1]);

        const salt = parts[2];

        const expectedHash = parts[3];



        if (!Number.isInteger(iterations) || iterations <= 0 || !salt || !expectedHash) {

            return false;

        }



        const actualHash = pbkdf2Sync(String(plainPassword || ''), salt, iterations, 64, 'sha512').toString('hex');



        try {

            return timingSafeEqual(Buffer.from(actualHash, 'hex'), Buffer.from(expectedHash, 'hex'));

        } catch (_e) {

            return false;

        }

    };



    // CPI Configuration (OAuth 2.0)

    const CPI_CONFIG = {

        // baseURL: process.env.CPI_BASE_URL || 'https://trial-2-5pxafgim.it-cpitrial05-rt.cfapps.us10-001.hana.ondemand.com',

        // clientId: process.env.CPI_CLIENT_ID || 'sb-3e780a42-2706-4b69-b08e-c4ab959661e0!b624779|it-rt-trial-2-5pxafgim!b26655',

        // clientSecret: process.env.CPI_CLIENT_SECRET || '173b4596-7bbb-4ba1-827c-390b00fc7c74$5gMgdklFuApoEg3ITwF-AeuIOe_98Y4xiTkivF8V2lY=',

        // tokenURL: process.env.CPI_TOKEN_URL || 'https://trial-2-5pxafgim.authentication.us10.hana.ondemand.com/oauth/token',

        baseURL: process.env.CPI_BASE_URL || 'https://trial-2-zigfg8rd.it-cpitrial06-rt.cfapps.us10-001.hana.ondemand.com',

        clientId: process.env.CPI_CLIENT_ID || 'sb-8a621bee-2a22-4c2a-b9ac-eb2b683bd9b3!b630030|it-rt-trial-2-zigfg8rd!b55215',

        clientSecret: process.env.CPI_CLIENT_SECRET || 'ef48fab1-d425-451f-8d57-1b8c04da5574$ukm-ivjfrjsmlo1I0FACQ5xhmSgwvk6ZKZaIqUH2FOo=',

        tokenURL: process.env.CPI_TOKEN_URL || 'https://trial-2-zigfg8rd.authentication.us10.hana.ondemand.com/oauth/token',

        endpoints: {
            salesOrder: process.env.CPI_SALES_ORDER_ENDPOINT || '/http/api/v2/sales-orders',
            dispatcher: process.env.CPI_DISPATCHER_ENDPOINT || '/http/api/v2/sales-orders',
            salesOrderFullUrl: process.env.CPI_SALES_ORDER_URL,
            dispatcherFullUrl: process.env.CPI_DISPATCHER_URL
        }

    };



    // OAuth 2.0 Token Cache

    let cpiAccessToken = null;

    let tokenExpiry = null;



    // Helper: Get OAuth 2.0 Access Token

    const getCPIAccessToken = async () => {

        // Return cached token if still valid

        if (cpiAccessToken && tokenExpiry && Date.now() < tokenExpiry) {

            return cpiAccessToken;

        }



        try {

            const tokenResponse = await axios.post(

                CPI_CONFIG.tokenURL,

                'grant_type=client_credentials',

                {

                    auth: {

                        username: CPI_CONFIG.clientId,

                        password: CPI_CONFIG.clientSecret

                    },

                    headers: {

                        'Content-Type': 'application/x-www-form-urlencoded'

                    },

                    timeout: 15000 // 15 seconds timeout for token

                }

            );



            cpiAccessToken = tokenResponse.data.access_token;

            // Cache token for 80% of expiry time (default 3600s = 1 hour)

            const expiresIn = tokenResponse.data.expires_in || 3600;

            tokenExpiry = Date.now() + (expiresIn * 0.8 * 1000);



            console.log('[CPI] OAuth token obtained, expires in:', expiresIn, 'seconds');

            return cpiAccessToken;



        } catch (error) {

            console.error('[CPI] Token fetch failed:', error.response?.data || error.message);

            throw new Error('Failed to obtain CPI access token');

        }

    };



    // Helper: Call CPI endpoint with OAuth 2.0

    const callCPI = async (endpoint, data, options = {}) => {

        try {

            // Get valid access token

            const accessToken = await getCPIAccessToken();

            const contentType = String(options.contentType || 'application/json').trim() || 'application/json';

            const extraHeaders = (options && options.headers && typeof options.headers === 'object') ? options.headers : {};



            console.log(`[CPI] Calling endpoint: ${endpoint}`);

            console.log('[CPI] Request data:', JSON.stringify(data, null, 2));



            const response = await axios.post(

                `${CPI_CONFIG.baseURL}${endpoint}`,

                data,

                {

                    headers: {

                        'Authorization': `Bearer ${accessToken}`,

                        'Content-Type': contentType,

                        ...extraHeaders

                    },

                    timeout: 120000 // 120 seconds timeout for SO + Delivery chain

                }

            );



            console.log('[CPI] Response status:', response.status);

            console.log('[CPI] Response data:', JSON.stringify(response.data, null, 2));



            return response.data;



        } catch (error) {

            if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {

                console.error('[CPI] TIMEOUT: CPI request timed out after 30s');

                throw new Error('CPI Timeout: Request timed out after 30 seconds');

            }

            console.error('[CPI] Call Failed:', error.response?.status, error.response?.statusText);

            console.error('[CPI] Error details:', error.response?.data || error.message);

            // Extract meaningful error message

            const errMsg = error.response?.data?.error?.message?.value

                || error.response?.data?.message

                || error.response?.data

                || error.message;

            throw new Error(`CPI Error: ${typeof errMsg === 'string' ? errMsg : JSON.stringify(errMsg)}`);

        }

    };



    const extractBatchIdFromAny = (raw) => {

        if (!raw) {

            return '';

        }



        if (typeof raw === 'string') {

            const text = raw;

            const regexes = [

                /"Batch_ID"\s*:\s*"([^"]+)"/i,

                /"batchId"\s*:\s*"([^"]+)"/i,

                /<(?:[^:>]+:)?Batch_ID>([^<]+)<\/(?:[^:>]+:)?Batch_ID>/i,

                /<(?:[^:>]+:)?BatchId>([^<]+)<\/(?:[^:>]+:)?BatchId>/i,

                /<(?:[^:>]+:)?SAP_MessageProcessingLogID>([^<]+)<\/(?:[^:>]+:)?SAP_MessageProcessingLogID>/i,

                /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/

            ];



            for (const re of regexes) {

                const m = text.match(re);

                if (m && m[1]) {

                    return String(m[1]).trim();

                }

                if (m && m[0] && re.source.indexOf('{8}-') !== -1) {

                    return String(m[0]).trim();

                }

            }

            return '';

        }



        const data = raw;

        const candidates = [

            data.Batch_ID,

            data.batchId,

            data.batchID,

            data.SAP_MessageProcessingLogID,

            data.sapMessageProcessingLogId,

            data.CorrelationId,

            data.correlationId,

            data.requestId

        ];



        for (const c of candidates) {

            const v = String(c || '').trim();

            if (v) {

                return v;

            }

        }



        if (data['multimap:Messages']?.['multimap:Message1']) {

            const nested = data['multimap:Messages']['multimap:Message1'];

            return extractBatchIdFromAny(nested);

        }



        if (data.value && typeof data.value === 'object') {

            return extractBatchIdFromAny(data.value);

        }



        return '';

    };



    const isDispatcherPayload = (data) => {

        if (!data || typeof data !== 'object') {

            return false;

        }

        return Array.isArray(data.Order)

            || Array.isArray(data.orders)

            || !!data.QT_REQ_ID

            || !!data.IT_ITEMS;

    };



    const isLikelyLegacyCsvJsonPayload = (payload) => {

        const body = String(payload || '').trim();

        if (!body || (body[0] !== '{' && body[0] !== '[')) {

            return false;

        }

        return /"uploadType"\s*:\s*"CSV"/i.test(body)

            && /"Order"\s*:/i.test(body);

    };



    const escapeCsvCell = (value) => {

        const text = String(value === undefined || value === null ? '' : value);

        if (text.indexOf('"') !== -1 || text.indexOf(',') !== -1 || text.indexOf('\n') !== -1 || text.indexOf('\r') !== -1) {

            return `"${text.replace(/"/g, '""')}"`;

        }

        return text;

    };



    const buildCsvFromLegacyPayload = (legacyPayload) => {

        const root = legacyPayload && typeof legacyPayload === 'object' ? legacyPayload : {};

        const orders = Array.isArray(root.Order) ? root.Order : [];



        const preferredOrderHeaders = [

            'QT_REQ_ID', 'SALES_ORG', 'DISTR_CHAN', 'DIVISION', 'DOC_TYPE', 'PMNTTRMS',

            'INCOTERMS1', 'INCOTERMS2', 'CURRENCY', 'SOLD_TO', 'SHIP_TO', 'PAYER', 'BILL_TO',

            'VALID_FROM', 'VALID_TO', 'PRICE_DATE', 'PURCH_NO_C', 'SALES_DIST', 'CUST_GROUP',

            'RequesterEmail', 'FlowType'

        ];

        const preferredItemHeaders = ['ITEM_NO', 'MATERIAL', 'QUANTITY', 'UNIT', 'PLANT', 'STOR_LOC', 'DELIVERY_DATE'];



        const orderExtraHeaders = [];

        const itemExtraHeaders = [];

        const rowObjects = [];



        const pushUnique = (target, key) => {

            if (!key || target.indexOf(key) !== -1) {

                return;

            }

            target.push(key);

        };



        orders.forEach((order) => {

            const safeOrder = order && typeof order === 'object' ? order : {};

            Object.keys(safeOrder)

                .filter((key) => key !== 'IT_ITEMS')

                .forEach((key) => pushUnique(orderExtraHeaders, key));



            const items = Array.isArray(safeOrder.IT_ITEMS && safeOrder.IT_ITEMS.item)

                ? safeOrder.IT_ITEMS.item

                : [{}];



            items.forEach((item) => {

                const safeItem = item && typeof item === 'object' ? item : {};

                Object.keys(safeItem).forEach((key) => pushUnique(itemExtraHeaders, key));

                rowObjects.push({ order: safeOrder, item: safeItem });

            });

        });



        if (!rowObjects.length) {

            throw new Error('Legacy CSV JSON payload does not contain any rows');

        }



        const orderHeaders = preferredOrderHeaders.concat(orderExtraHeaders.filter((key) => preferredOrderHeaders.indexOf(key) === -1));

        const itemHeaders = preferredItemHeaders.concat(itemExtraHeaders.filter((key) => preferredItemHeaders.indexOf(key) === -1));

        const headers = orderHeaders.concat(itemHeaders);



        const lines = [headers.join(',')];

        rowObjects.forEach((rowObj) => {

            const values = headers.map((header) => {

                if (rowObj.item && Object.prototype.hasOwnProperty.call(rowObj.item, header)) {

                    return escapeCsvCell(rowObj.item[header]);

                }

                return escapeCsvCell(rowObj.order && Object.prototype.hasOwnProperty.call(rowObj.order, header) ? rowObj.order[header] : '');

            });

            lines.push(values.join(','));

        });



        return lines.join('\n');

    };



    const isCsvPayloadRequest = ({ payloadType, uploadType, payload }) => {

        const typeText = String(payloadType || '').toLowerCase();

        if (typeText.indexOf('text/csv') !== -1 || typeText === 'csv') {

            return true;

        }



        if (String(uploadType || '').trim().toUpperCase() === 'CSV') {

            return true;

        }



        return isLikelyLegacyCsvJsonPayload(payload);

    };



    const decodeXmlEntities = (text) => String(text || '')

        .replace(/&lt;/g, '<')

        .replace(/&gt;/g, '>')

        .replace(/&amp;/g, '&')

        .replace(/&quot;/g, '"')

        .replace(/&apos;/g, "'");



    const extractXmlTagValue = (xml, tagName) => {

        const src = String(xml || '');

        const pattern = new RegExp(`<\\s*(?:[^:>\\s]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*(?:[^:>\\s]+:)?${tagName}\\s*>`, 'i');

        const match = src.match(pattern);

        return match && match[1] ? decodeXmlEntities(match[1]).trim() : '';

    };



    const parseDocumentsFromXml = (xmlBody) => {

        const xml = String(xmlBody || '').trim();

        if (!xml || xml.indexOf('<') === -1) {

            return null;

        }



        const salesOrder = extractXmlTagValue(xml, 'SalesOrder');

        const delivery = extractXmlTagValue(xml, 'DeliveryDocument') || extractXmlTagValue(xml, 'Delivery');

        const billing = extractXmlTagValue(xml, 'BillingDocument') || extractXmlTagValue(xml, 'Billing');

        const statusRaw = (extractXmlTagValue(xml, 'Status') || extractXmlTagValue(xml, 'MsgType') || '').toUpperCase();

        const message = extractXmlTagValue(xml, 'Message') || extractXmlTagValue(xml, 'MsgDesc');

        const batchId = extractBatchIdFromAny(xml);



        if (!(salesOrder || delivery || billing || statusRaw || message || batchId)) {

            return null;

        }



        const status = statusRaw === 'S'

            ? 'SUCCESS'

            : (statusRaw || ((salesOrder || delivery || billing) ? 'SUCCESS' : 'PENDING'));



        return {

            salesOrder,

            delivery,

            billing,

            status,

            message: message || ((salesOrder || delivery)

                ? 'Created Sales Order and Delivery successfully'

                : 'CPI returned XML payload'),

            batchId,

            currentIFlow: delivery

                ? 'IF_DCAP_O2C_ProcessOutboundDelivery'

                : (salesOrder ? 'IF_DCAP_O2C_ProcessSalesOrder' : 'Main Dispatcher')

        };

    };



    const normalizeCpiResult = (raw) => {

        if (raw == null) {

            return {

                salesOrder: 'N/A',

                delivery: 'N/A',

                billing: 'N/A',

                status: 'WARNING',

                message: 'CPI returned empty response',

                batchId: '',

                currentIFlow: ''

            };

        }



        if (typeof raw === 'string') {

            const parsedXml = parseDocumentsFromXml(raw);

            if (parsedXml) {

                return parsedXml;

            }

            return {

                salesOrder: 'N/A',

                delivery: 'N/A',

                billing: 'N/A',

                status: 'PENDING',

                message: 'CPI returned non-JSON string response',

                batchId: extractBatchIdFromAny(raw),

                currentIFlow: 'Main Dispatcher'

            };

        }



        let result = raw;



        if (result['multimap:Messages']?.['multimap:Message1']) {

            const message1 = result['multimap:Messages']['multimap:Message1'];

            result = message1.NexDrive_Result || message1['NexDrive_Result'] || message1;

        }



        if (result && typeof result === 'object' && result.value && typeof result.value === 'object') {

            result = result.value;

        }



        if (result && typeof result === 'object' && result.Root) {

            result = result.Root;

        }



        if (result && typeof result === 'object' && result.NexDrive_Result) {

            result = result.NexDrive_Result;

        }



        // Unwrap common dispatcher/worker response envelope shapes.

        if (result && typeof result === 'object' && result.responses && typeof result.responses === 'object') {

            const wrapped = result.responses;

            if (Array.isArray(wrapped.item) && wrapped.item.length > 0) {

                result = wrapped.item[0];

            } else if (wrapped.item && typeof wrapped.item === 'object') {

                result = wrapped.item;

            } else if (Array.isArray(wrapped.root) && wrapped.root.length > 0) {

                result = wrapped.root[0];

            } else if (wrapped.root && typeof wrapped.root === 'object') {

                result = wrapped.root;

            }

        }



        if (result && typeof result === 'object' && Array.isArray(result.item) && result.item.length === 1) {

            result = result.item[0];

        }



        if (result && typeof result === 'object' && result.item && typeof result.item === 'object' && !Array.isArray(result.item)) {

            result = result.item;

        }



        const nestedXmlCandidate =

            (typeof result?.body === 'string' && result.body) ||

            (typeof result?.Body === 'string' && result.Body) ||

            (typeof result?.payload === 'string' && result.payload) ||

            (typeof result?.Payload === 'string' && result.Payload) ||

            (typeof result?.messageBody === 'string' && result.messageBody) ||

            (typeof result?.MessageBody === 'string' && result.MessageBody);



        if (nestedXmlCandidate) {

            const parsedNestedXml = parseDocumentsFromXml(nestedXmlCandidate);

            if (parsedNestedXml) {

                return parsedNestedXml;

            }

        }



        const salesOrder =

            result?.SalesOrder || result?.salesOrder || result?.SalesOrderNumber || result?.SoNumber || result?.soNumber || 'N/A';

        const delivery =

            result?.DeliveryDocument || result?.delivery || result?.Delivery || result?.deliveryDoc || result?.DeliveryNo || 'N/A';

        const billing =

            result?.BillingDocument || result?.billing || result?.Billing || result?.Invoice || result?.billingDoc || 'N/A';

        const batchId = extractBatchIdFromAny(result);

        const currentIFlow = String(

            result?.currentIFlow || result?.currentIflow || result?.currentStage || result?.iflow || result?.stage || result?.step || ''

        ).trim();

        const hasDocuments = (salesOrder && salesOrder !== 'N/A') || (delivery && delivery !== 'N/A') || (billing && billing !== 'N/A');

        const status = String(

            result?.Status || result?.status || result?.statusCode || result?.StatusCode ||

            (hasDocuments ? 'SUCCESS' : (batchId ? 'PENDING' : 'WARNING'))

        );

        const message = String(

            result?.SystemMessage || result?.message || result?.Message || result?.statusText || result?.StatusText ||

            (hasDocuments ? 'OK' : 'CPI accepted request')

        );



        return {

            salesOrder: String(salesOrder || 'N/A'),

            delivery: String(delivery || 'N/A'),

            billing: String(billing || 'N/A'),

            status,

            message,

            batchId,

            currentIFlow: currentIFlow || (delivery && delivery !== 'N/A'

                ? 'IF_DCAP_O2C_ProcessOutboundDelivery'

                : ((salesOrder && salesOrder !== 'N/A') ? 'IF_DCAP_O2C_ProcessSalesOrder' : 'Main Dispatcher'))

        };

    };



    const buildProcessingRecordId = (batchId, quotationNo) => {

        const raw = `${batchId || 'NO_BATCH'}__${quotationNo || 'NO_QUOTATION'}`;

        let clean = String(raw).replace(/[^a-zA-Z0-9_]/g, '_');

        if (clean.length > 170) {

            clean = clean.substring(0, 170);

        }

        return `QT_${clean}`;

    };



    const normalizeExecutionStatus = (statusValue, executedAt) => {

        const raw = String(statusValue == null ? '' : statusValue).trim();

        const upper = raw.toUpperCase();

        const executed = String(executedAt == null ? '' : executedAt).trim();



        if (!upper) {

            return executed

                ? { code: 'COMPLETED', text: 'Completed' }

                : { code: 'NOT_STARTED', text: 'Not Started' };

        }



        if (upper === 'A') {

            return { code: 'NOT_STARTED', text: 'Not Started' };

        }



        if (upper === 'B') {

            return { code: 'IN_PROGRESS', text: 'In Progress' };

        }



        if (/^(C|X|S|Y|1|TRUE|T)$/.test(upper)) {

            return { code: 'COMPLETED', text: 'Completed' };

        }



        if (/^(N|0|FALSE|F)$/.test(upper)) {

            return { code: 'NOT_STARTED', text: 'Not Started' };

        }



        if (/^(P|R|I|W)$/.test(upper)) {

            return { code: 'IN_PROGRESS', text: 'In Progress' };

        }



        if (/(NOT[_\s-]*START|N\/?A|NONE|INITIAL)/.test(upper)) {

            return { code: 'NOT_STARTED', text: 'Not Started' };

        }



        if (/(FAIL|ERROR|REJECT|CANCEL|EXCEPTION)/.test(upper)) {

            return { code: 'FAILED', text: 'Failed' };

        }



        if (/(IN[_\s-]*PROGRESS|RUNNING|PENDING|QUEUE|WAIT|PROCESSING|STARTED)/.test(upper)) {

            return { code: 'IN_PROGRESS', text: 'In Progress' };

        }



        if (/(COMPLETE|COMPLETED|SUCCESS|DONE|POSTED|CONFIRMED|PICKED|PGI|ISSUED|FINISHED|OK)/.test(upper)) {

            return { code: 'COMPLETED', text: 'Completed' };

        }



        const normalizedCode = upper.replace(/[^A-Z0-9]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');

        let normalizedText = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();

        if (normalizedText) {

            normalizedText = normalizedText.charAt(0).toUpperCase() + normalizedText.slice(1).toLowerCase();

        }



        return {

            code: normalizedCode || (executed ? 'COMPLETED' : 'IN_PROGRESS'),

            text: normalizedText || (executed ? 'Completed' : 'In Progress')

        };

    };



    const resolveWarehouseTracking = (payload) => {

        const p = payload || {};

        const callbackSource = String(

            p.callbackSource || p.source || p.approverType || p.workflowSource || p.stageOwner || ''

        ).toUpperCase();

        const callbackStep = String(

            p.callbackStep || p.currentStage || p.stage || p.currentIFlow || p.currentIflow || p.step || ''

        ).trim();

        const warehouseStatusRaw = String(

            p.warehouseStatus || p.callbackStatus || p.status || p.Status || p.warehouse_state || ''

        ).toUpperCase();

        const hasBilling = !!String(p.billingDoc || p.billing || p.BillingDocument || '').trim();

        const hasDelivery = !!String(p.deliveryDoc || p.delivery || p.DeliveryDocument || '').trim();

        const baseMessage = String(

            p.warehouseMessage || p.message || p.Message || p.statusText || p.StatusText || ''

        ).trim();

        const pickingExecution = normalizeExecutionStatus(

            firstNonEmpty(

                p.pickingStatus,

                p.PickingStatus,

                p.pickStatus,

                p.PickStatus,

                p.pickingState,

                p.PickingState,

                p.pickingDone,

                p.PickingDone

            ),

            firstNonEmpty(

                p.pickingDate,

                p.PickingDate,

                p.pickDate,

                p.PickDate,

                p.pickingAt,

                p.PickingAt

            )

        );

        const pgiExecution = normalizeExecutionStatus(

            firstNonEmpty(

                p.pgiStatus,

                p.PGIStatus,

                p.postGoodsIssueStatus,

                p.PostGoodsIssueStatus,

                p.giStatus,

                p.GIStatus,

                p.pgiState,

                p.PGIState,

                p.pgiDone,

                p.PgiDone

            ),

            firstNonEmpty(

                p.pgiDate,

                p.PGIDate,

                p.postGoodsIssueDate,

                p.PostGoodsIssueDate,

                p.giDate,

                p.GiDate,

                p.pgiAt,

                p.PGIAt,

                p.actualGiDate,

                p.ActualGiDate

            )

        );



        const isError =

            warehouseStatusRaw.includes('FAIL') ||

            warehouseStatusRaw.includes('ERROR') ||

            warehouseStatusRaw.includes('REJECT');

        const isPgiDone =

            warehouseStatusRaw.includes('PGI') ||

            warehouseStatusRaw.includes('PICKING_DONE') ||

            warehouseStatusRaw.includes('PICK_DONE') ||

            warehouseStatusRaw.includes('PICKING_COMPLETED') ||

            warehouseStatusRaw.includes('PICKING_COMPLETE') ||

            warehouseStatusRaw.includes('PICK_COMPLETE');

        const isSalesApproved =

            warehouseStatusRaw.includes('SALES_APPROVED') ||

            warehouseStatusRaw.includes('APPROVED') ||

            warehouseStatusRaw.includes('APPROVE') ||

            warehouseStatusRaw.includes('RELEASED');

        const isSalesSubmitted =

            warehouseStatusRaw.includes('RUNNING') ||

            warehouseStatusRaw.includes('STARTED') ||

            warehouseStatusRaw.includes('PENDING') ||

            warehouseStatusRaw.includes('SUBMIT') ||

            warehouseStatusRaw.includes('SENT') ||

            warehouseStatusRaw.includes('CREATED') ||

            warehouseStatusRaw.includes('QUEUE');

        const isWarehouseRunning =

            warehouseStatusRaw.includes('PICK') ||

            warehouseStatusRaw.includes('WAREHOUSE') ||

            warehouseStatusRaw.includes('RUNNING') ||

            warehouseStatusRaw.includes('IN_PROGRESS') ||

            warehouseStatusRaw.includes('PROCESS') ||

            warehouseStatusRaw.includes('QUEUE');



        if (hasBilling) {

            return {

                statusCode: 'SUCCESS',

                statusText: 'Hoàn tất',

                currentStage: callbackStep || 'IF_DCAP_O2C_CreateBillingDocument: Completed',

                message: baseMessage || 'Đã tạo Billing Document'

            };

        }



        if (isError) {

            let failedStage = 'Quotation Processing: Failed';

            if (callbackSource.includes('SALES')) {

                failedStage = 'IF_DCAP_O2C_ProcessSalesOrder: Failed';

            } else if (callbackSource.includes('WAREHOUSE')) {

                failedStage = 'Warehouse Picking: Failed';

            }



            return {

                statusCode: 'ERROR',

                statusText: callbackSource.includes('SALES') ? 'Lỗi phê duyệt Sales' : 'Lỗi xử lý',

                currentStage: callbackStep || failedStage,

                message: baseMessage || 'Luồng xử lý quotation thất bại'

            };

        }



        if (pgiExecution.code === 'COMPLETED' || isPgiDone) {

            return {

                statusCode: 'RUNNING',

                statusText: 'Đã PGI - chờ Billing',

                currentStage: callbackStep || 'Warehouse PGI: Completed',

                message: baseMessage || 'Đã execute PGI, đang chờ tạo Billing'

            };

        }



        if (pgiExecution.code === 'IN_PROGRESS') {

            return {

                statusCode: 'RUNNING',

                statusText: 'Đang thực hiện PGI',

                currentStage: callbackStep || 'Warehouse PGI: In Progress',

                message: baseMessage || 'Đang thực hiện PGI'

            };

        }



        if (pickingExecution.code === 'COMPLETED') {

            return {

                statusCode: 'RUNNING',

                statusText: 'Đã Picking - chờ PGI',

                currentStage: callbackStep || 'Warehouse Picking: Completed',

                message: baseMessage || 'Đã execute Picking, đang chờ PGI'

            };

        }



        if (pickingExecution.code === 'IN_PROGRESS') {

            return {

                statusCode: 'RUNNING',

                statusText: 'Warehouse đang xử lý picking',

                currentStage: callbackStep || 'Warehouse Picking: In Progress',

                message: baseMessage || 'Đã gửi warehouse, đang xử lý picking'

            };

        }



        if (callbackSource.includes('SALES') && isSalesApproved) {

            return {

                statusCode: 'RUNNING',

                statusText: 'Đã duyệt Quotation - chờ Warehouse',

                currentStage: callbackStep || 'Sales Order Approval: Completed',

                message: baseMessage || 'Quotation đã được Sales Approver phê duyệt'

            };

        }



        if (callbackSource.includes('SALES') && isSalesSubmitted) {

            return {

                statusCode: 'RUNNING',

                statusText: 'Đã gửi Sales Team phê duyệt',

                currentStage: callbackStep || 'Sales Team Approval: Submitted',

                message: baseMessage || 'Đã gửi SBPA, đang chờ Sales Team xác nhận'

            };

        }



        if (isWarehouseRunning || callbackSource.includes('WAREHOUSE') || hasDelivery) {

            return {

                statusCode: 'RUNNING',

                statusText: 'Warehouse đang xử lý picking',

                currentStage: callbackStep || 'Warehouse Picking: In Progress',

                message: baseMessage || 'Đã gửi warehouse, đang xử lý picking'

            };

        }



        return {

            statusCode: 'RUNNING',

            statusText: 'Đang xử lý',

            currentStage: callbackStep || 'Quotation Processing: In Progress',

            message: baseMessage || 'Callback tiến độ quotation đã được ghi nhận'

        };

    };



    const safeJsonParse = (text) => {

        if (typeof text !== 'string') {

            return null;

        }

        try {

            return JSON.parse(text);

        } catch (_e) {

            return null;

        }

    };



    const asArray = (value) => {

        if (Array.isArray(value)) {

            return value;

        }

        if (value == null) {

            return [];

        }

        if (typeof value === 'object') {

            if (Array.isArray(value.item)) {

                return value.item;

            }

            if (value.item && typeof value.item === 'object') {

                return [value.item];

            }

            return [value];

        }

        return [];

    };



    const firstNonEmpty = (...values) => {

        for (const v of values) {

            const text = String(v == null ? '' : v).trim();

            if (text) {

                return text;

            }

        }

        return '';

    };



    const toNumberOr = (value, fallback = 0) => {

        const n = Number(value);

        return Number.isFinite(n) ? n : fallback;

    };



    const clipText = (text, maxLength) => {

        const src = String(text || '');

        if (!maxLength || src.length <= maxLength) {

            return src;

        }

        return src.slice(0, Math.max(0, maxLength - 3)) + '...';

    };



    const normalizeQuotationStatus = (rawStatus) => {

        const status = String(rawStatus || '').trim().toUpperCase();

        if (!status) {

            return 'SUCCESS';

        }



        if (status === 'S' || status === 'SUCCESS' || status === 'COMPLETED') {

            return 'SUCCESS';

        }



        if (

            status === 'E'

            || status.indexOf('ERROR') !== -1

            || status.indexOf('FAIL') !== -1

            || status.indexOf('REJECT') !== -1

        ) {

            return 'ERROR';

        }



        if (

            status === 'W'

            || status.indexOf('RUNNING') !== -1

            || status.indexOf('PENDING') !== -1

            || status.indexOf('QUEUE') !== -1

            || status.indexOf('PROCESS') !== -1

        ) {

            return 'RUNNING';

        }



        return status;

    };



    const normalizeCallbackSource = (payload) => {

        const p = payload || {};

        return String(

            p.callbackSource || p.source || p.approverType || p.workflowSource || p.stageOwner || p.flowType || ''

        ).trim().toUpperCase();

    };



    const parseNestedPayloadObject = (payload) => {

        const p = payload || {};

        const raw = p.payload || p.responsePayload || p.rawPayload || null;



        if (!raw) {

            return null;

        }



        if (typeof raw === 'object') {

            return raw;

        }



        if (typeof raw === 'string') {

            const parsed = safeJsonParse(raw);

            if (parsed && typeof parsed === 'object') {

                return parsed;

            }

        }



        return null;

    };



    const stringifyPayloadSafe = (payload) => {

        if (payload == null) {

            return '';

        }



        if (typeof payload === 'string') {

            return payload;

        }



        try {

            return JSON.stringify(payload);

        } catch (_e) {

            return '';

        }

    };



    const shouldUseProcurementCallback = (payload, callbackSource) => {

        const p = payload || {};

        const source = String(callbackSource || '').toUpperCase();



        if (

            source.includes('SALES')

            || source.includes('WAREHOUSE')

            || source.includes('O2C')

            || source.includes('DELIVERY')

            || source.includes('BILLING')

        ) {

            return false;

        }



        if (

            source.includes('PROCUREMENT')

            || source.includes('PURCHASE')

            || source.includes('PURCH')

            || source.includes('PG_APPROVER')

            || source.includes('PURCHASE_GROUP')

            || source.includes('PO')

            || source.includes('PR')

        ) {

            return true;

        }



        if (firstNonEmpty(p.poNumber, p.poNo, p.preqNo, p.prNo, p.poItem, p.preqItem)) {

            return true;

        }



        if (toNumberOr(p.expectedPoCount || p.expectedPOCount, 0) > 0) {

            return true;

        }



        const nested = parseNestedPayloadObject(p);

        if (!nested || typeof nested !== 'object') {

            return false;

        }



        const nestedEtResultsNode = nested.EtResults || nested.etResults || nested.results;

        const nestedEtRows = asArray(nestedEtResultsNode && (nestedEtResultsNode.item || nestedEtResultsNode.Item || nestedEtResultsNode));

        for (const row of nestedEtRows) {

            if (firstNonEmpty(row && row.poNumber, row && row.PoNumber, row && row.preqNo, row && row.PreqNo, row && row.prNo, row && row.ebeln, row && row.EBELN)) {

                return true;

            }



            const itItemsNode = row && (row.ItItems || row.itItems || row.ItPoItems || row.itPoItems || row.ItPrItems || row.itPrItems);

            const itRows = asArray(itItemsNode && (itItemsNode.item || itItemsNode.Item || itItemsNode));

            for (const it of itRows) {

                if (firstNonEmpty(it && it.poNumber, it && it.PoNumber, it && it.preqNo, it && it.PreqNo, it && it.prNo, it && it.ebeln, it && it.EBELN)) {

                    return true;

                }

            }

        }



        if (

            nested.ItPoItems || nested.itPoItems || nested.ItPrItems || nested.itPrItems ||

            nested.pos || nested.prs ||

            nested.poNumber || nested.preqNo

        ) {

            return true;

        }



        return false;

    };



    const normalizeToWarehouseCallbackPayload = (payload, callbackSource) => {

        const p = payload || {};

        const source = String(callbackSource || '').toUpperCase();

        const callbackStep = firstNonEmpty(

            p.callbackStep,

            p.currentStage,

            p.stage,

            p.currentIFlow,

            p.currentIflow,

            p.step

        );

        const callbackStatus = firstNonEmpty(p.callbackStatus, p.warehouseStatus, p.status, p.Status);

        const message = firstNonEmpty(p.message, p.Message, p.warehouseMessage, p.statusText, p.StatusText);

        const mergedMessage = firstNonEmpty(message, callbackStep);

        const nested = parseNestedPayloadObject(p);

        const payloadAsText = stringifyPayloadSafe(

            firstNonEmpty(p.payload, p.responsePayload, p.rawPayload)

                ? (p.payload || p.responsePayload || p.rawPayload)

                : (nested || p)

        );



        return {

            batchId: firstNonEmpty(p.batchId, p.batchID, p.BatchId),

            quotationNo: firstNonEmpty(p.quotationNo, p.quotation, p.quotationNumber, p.QuotationNo, p.Quotation),

            requestId: firstNonEmpty(

                p.requestId,

                p.requestID,

                p.RequestId,

                p.qtReqId,

                p.QtReqId,

                p.QT_REQ_ID,

                p.soReqId,

                p.SoReqId,

                p.SoReqID,

                p.PurchNoC,

                p.purchNoC

            ),

            salesOrder: firstNonEmpty(p.salesOrder, p.salesorder, p.SalesOrder),

            deliveryDoc: firstNonEmpty(p.deliveryDoc, p.delivery, p.DeliveryDocument, p.Delivery),

            billingDoc: firstNonEmpty(p.billingDoc, p.billing, p.BillingDocument, p.Billing),

            workflowInstanceId: firstNonEmpty(p.workflowInstanceId, p.workflowId, p.WorkflowInstanceId),

            soldTo: firstNonEmpty(p.soldTo, p.SoldTo, p.customerId),

            soldToName: firstNonEmpty(p.soldToName, p.SoldToName, p.customerName),

            customerId: firstNonEmpty(p.customerId, p.soldTo, p.SoldTo),

            customerName: firstNonEmpty(p.customerName, p.soldToName, p.SoldToName),

            purchNoC: firstNonEmpty(p.purchNoC, p.PurchNoC),

            docType: firstNonEmpty(p.docType, p.DocType),

            salesOrg: firstNonEmpty(p.salesOrg, p.SalesOrg),

            distrChan: firstNonEmpty(p.distrChan, p.DistrChan),

            division: firstNonEmpty(p.division, p.Division),

            shipTo: firstNonEmpty(p.shipTo, p.ShipTo),

            poNumber: firstNonEmpty(p.poNumber, p.poNo, p.PoNumber, p.PONumber, p.PoNo),

            reqDateH: firstNonEmpty(p.reqDateH, p.ReqDateH, p.reqDate, p.ReqDate),

            createdBy: firstNonEmpty(p.requesterEmail, p.RequesterEmail, p.createdBy, p.CreatedBy),

            createdAt: firstNonEmpty(p.createdAt, p.CreatedAt),

            netValue: firstNonEmpty(p.netValue, p.NetValue),

            taxAmount: firstNonEmpty(p.taxAmount, p.TaxAmount),

            grossValue: firstNonEmpty(p.grossValue, p.GrossValue),

            currency: firstNonEmpty(p.currency, p.Currency),

            validFrom: firstNonEmpty(p.validFrom, p.ValidFrom),

            validTo: firstNonEmpty(p.validTo, p.ValidTo),

            itemCount: toNumberOr(firstNonEmpty(p.itemCount, p.ItemCount), 0),

            payload: payloadAsText,

            deliveryStatus: firstNonEmpty(p.deliveryStatus, p.DeliveryStatus, p.status, p.Status),

            pickingStatus: normalizeExecutionStatus(

                firstNonEmpty(

                    p.pickingStatus,

                    p.PickingStatus,

                    p.pickStatus,

                    p.PickStatus,

                    p.pickingState,

                    p.PickingState

                ),

                firstNonEmpty(p.pickingDate, p.PickingDate, p.pickDate, p.PickDate, p.pickingAt, p.PickingAt)

            ).code,

            pickingDate: firstNonEmpty(p.pickingDate, p.PickingDate, p.pickDate, p.PickDate, p.pickingAt, p.PickingAt),

            pickingBy: firstNonEmpty(p.pickingBy, p.PickingBy, p.pickBy, p.PickBy, p.pickingUser, p.PickingUser),

            pgiStatus: normalizeExecutionStatus(

                firstNonEmpty(

                    p.pgiStatus,

                    p.PGIStatus,

                    p.postGoodsIssueStatus,

                    p.PostGoodsIssueStatus,

                    p.giStatus,

                    p.GIStatus,

                    p.pgiState,

                    p.PGIState

                ),

                firstNonEmpty(

                    p.pgiDate,

                    p.PGIDate,

                    p.postGoodsIssueDate,

                    p.PostGoodsIssueDate,

                    p.giDate,

                    p.GiDate,

                    p.pgiAt,

                    p.PGIAt,

                    p.actualGiDate,

                    p.ActualGiDate

                )

            ).code,

            pgiDate: firstNonEmpty(

                p.pgiDate,

                p.PGIDate,

                p.postGoodsIssueDate,

                p.PostGoodsIssueDate,

                p.giDate,

                p.GiDate,

                p.pgiAt,

                p.PGIAt,

                p.actualGiDate,

                p.ActualGiDate

            ),

            uploadType: firstNonEmpty(p.uploadType, p.fileType, p.UploadType, p.FileType),

            pgiBy: firstNonEmpty(p.pgiBy, p.PGIBy, p.postGoodsIssueBy, p.PostGoodsIssueBy, p.giBy, p.GiBy, p.pgiUser, p.PGIUser),

            warehouseStatus: callbackStatus,

            warehouseMessage: mergedMessage,

            callbackSource: source,

            callbackStep,

            callbackStatus,

            message: mergedMessage

        };

    };



    const normalizeToProcurementCallbackPayload = (payload, callbackSource) => {

        const p = payload || {};

        const source = String(callbackSource || '').toUpperCase();

        const callbackStep = firstNonEmpty(

            p.callbackStep,

            p.currentStage,

            p.stage,

            p.currentIFlow,

            p.currentIflow,

            p.step

        );

        const callbackStatus = firstNonEmpty(p.callbackStatus, p.status, p.Status);

        const message = firstNonEmpty(p.message, p.Message, p.statusText, p.StatusText);



        const nested = parseNestedPayloadObject(p);

        const payloadAsText = stringifyPayloadSafe(

            firstNonEmpty(p.payload, p.responsePayload, p.rawPayload) ? (p.payload || p.responsePayload || p.rawPayload) : nested || p

        );

        const mergedMessage = firstNonEmpty(message, callbackStep);



        return {

            batchId: firstNonEmpty(p.batchId, p.batchID, p.BatchId),

            quotationNo: firstNonEmpty(p.quotationNo, p.quotation, p.quotationNumber, p.QuotationNo),

            salesOrder: firstNonEmpty(p.salesOrder, p.salesorder, p.SalesOrder),

            poNumber: firstNonEmpty(p.poNumber, p.poNo, p.purchaseOrder, p.ebeln),

            poItem: firstNonEmpty(p.poItem),

            preqNo: firstNonEmpty(p.preqNo, p.prNo, p.purchaseRequisition, p.prNumber),

            preqItem: firstNonEmpty(p.preqItem),

            expectedPoCount: toNumberOr(firstNonEmpty(p.expectedPoCount, p.expectedPOCount, p.totalPoCount), 0),

            payload: payloadAsText,

            status: callbackStatus,

            callbackSource: source,

            callbackStep,

            callbackStatus,

            message: mergedMessage,

            uploadType: firstNonEmpty(p.uploadType, p.fileType, p.UploadType, p.FileType),

            createdBy: firstNonEmpty(p.requesterEmail, p.RequesterEmail, p.createdBy, p.CreatedBy)

        };

    };



    const scalarText = (value) => {

        if (value == null) {

            return '';

        }

        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {

            return String(value).trim();

        }

        return '';

    };



    const mapQuotationItem = (raw) => {

        const line = raw || {};

        const description = firstNonEmpty(

            line.MatDesc,

            line.matDesc,

            line.Description,

            line.description,

            line.MaterialDescription,

            line.materialDescription,

            line.ShortText,

            line.shortText

        );

        const salesUnit = firstNonEmpty(line.SalesUnit, line.salesUnit, line.Unit, line.unit);

        const billedQty = firstNonEmpty(line.BilledQty, line.billedQty, line.BillingQty, line.billingQty, line.Quantity, line.quantity);

        const netValue = firstNonEmpty(line.ItemValue, line.itemValue, line.NetValue, line.netValue, line.NetPrice, line.netPrice);

        const taxAmount = firstNonEmpty(line.TaxAmount, line.taxAmount);

        const grossValue = firstNonEmpty(line.GrossValue, line.grossValue);

        const totalAmount = firstNonEmpty(line.TotalAmount, line.totalAmount, line.GrossValue, line.grossValue);

        const billingDate = firstNonEmpty(line.BillingDate, line.billingDate, line.BillDate, line.billDate);

        const billingType = firstNonEmpty(line.BillingType, line.billingType, line.InvoiceType, line.invoiceType);

        const documentNo = firstNonEmpty(

            line.DocumentNo,

            line.documentNo,

            line.DeliveryNo,

            line.deliveryNo,

            line.DeliveryDocument,

            line.deliveryDocument,

            line.deliveryDoc,

            line.VBELN,

            line.vbeln,

            line.BillingDoc,

            line.BillingDocument,

            line.billingDoc,

            line.billing

        );

        const pickingStatus = firstNonEmpty(

            line.PickingStatus,

            line.pickingStatus,

            line.PickStatus,

            line.pickStatus,

            line.PickingState,

            line.pickingState

        );

        const pgiStatus = firstNonEmpty(

            line.PGIStatus,

            line.pgiStatus,

            line.PostGoodsIssueStatus,

            line.postGoodsIssueStatus,

            line.GiStatus,

            line.giStatus

        );



        const pickingExecution = normalizeExecutionStatus(pickingStatus, firstNonEmpty(line.PickingDate, line.pickingDate, line.PickDate, line.pickDate, line.PickingAt, line.pickingAt));

        const pgiExecution = normalizeExecutionStatus(pgiStatus, firstNonEmpty(line.PGIDate, line.pgiDate, line.PostGoodsIssueDate, line.postGoodsIssueDate, line.GIDate, line.giDate, line.PGIAt, line.pgiAt));



        return {

            documentNo,

            itemNo: firstNonEmpty(line.ItemNo, line.itemNo),

            material: firstNonEmpty(line.Material, line.material),

            matDesc: description,

            description,

            quantity: billedQty,

            salesUnit,

            unit: salesUnit,

            netPrice: firstNonEmpty(line.NetPrice, line.netPrice),

            itemValue: firstNonEmpty(line.ItemValue, line.itemValue),

            netValue,

            taxAmount,

            grossValue,

            totalAmount,

            billingDate,

            billingType,

            plant: firstNonEmpty(line.Plant, line.plant),

            storLoc: firstNonEmpty(line.StorLoc, line.storLoc, line.StorageLoc, line.storageLocation),

            deliveryDate: firstNonEmpty(line.DelivDate, line.delivDate, line.DeliveryDate, line.deliveryDate),

            reqDate: firstNonEmpty(line.ReqDate, line.reqDate, line.ReqDateH, line.reqDateH, line.RequestDate, line.requestDate),

            itemCateg: firstNonEmpty(line.ItemCateg, line.itemCateg, line.ItemCategory, line.itemCategory),

            shipPoint: firstNonEmpty(line.ShipPoint, line.shipPoint, line.ShippingPoint, line.shippingPoint),

            refDoc: firstNonEmpty(line.RefDoc, line.refDoc, line.ReferenceDoc, line.referenceDoc),

            refItem: firstNonEmpty(line.RefItem, line.refItem, line.ReferenceItem, line.referenceItem),

            currency: firstNonEmpty(line.Currency, line.currency),

            deliveryStatus: firstNonEmpty(line.DeliveryStatus, line.deliveryStatus, line.Status, line.status),

            pickingStatus: pickingExecution.code,

            pickingDate: firstNonEmpty(line.PickingDate, line.pickingDate, line.PickDate, line.pickDate, line.PickingAt, line.pickingAt),

            pickingBy: firstNonEmpty(line.PickingBy, line.pickingBy, line.PickBy, line.pickBy, line.PickingUser, line.pickingUser),

            pickingQty: firstNonEmpty(line.PickingQty, line.pickingQty, line.PickedQty, line.pickedQty),

            pickingMessage: firstNonEmpty(line.PickingMessage, line.pickingMessage, line.PickMessage, line.pickMessage),

            pgiStatus: pgiExecution.code,

            pgiDate: firstNonEmpty(line.PGIDate, line.pgiDate, line.PostGoodsIssueDate, line.postGoodsIssueDate, line.GIDate, line.giDate, line.PGIAt, line.pgiAt),

            pgiBy: firstNonEmpty(line.PGIBy, line.pgiBy, line.PostGoodsIssueBy, line.postGoodsIssueBy, line.GIBy, line.giBy),

            pgiDocument: firstNonEmpty(line.PGIDocument, line.pgiDocument, line.MaterialDocument, line.materialDocument),

            pgiMessage: firstNonEmpty(line.PGIMessage, line.pgiMessage, line.PostGoodsIssueMessage, line.postGoodsIssueMessage)

        };

    };



    const normalizeLineKeyPart = (value, { numeric = false } = {}) => {

        const text = scalarText(value);

        if (!text) {

            return '';

        }



        if (numeric) {

            const numericCandidate = text.replace(/,/g, '.');

            const nValue = Number(numericCandidate);

            if (!Number.isNaN(nValue)) {

                return String(nValue);

            }

        }



        if (/^\d+$/.test(text)) {

            return String(parseInt(text, 10));

        }



        return text.toUpperCase();

    };



    const buildQuotationLineKey = (line) => {

        const documentNo = normalizeLineKeyPart(firstNonEmpty(line && line.documentNo, line && line.billingDoc), { numeric: true });

        const itemNo = normalizeLineKeyPart(firstNonEmpty(line && line.itemNo), { numeric: true });

        const material = normalizeLineKeyPart(firstNonEmpty(line && line.material));

        const plant = normalizeLineKeyPart(firstNonEmpty(line && line.plant));

        const quantity = normalizeLineKeyPart(firstNonEmpty(line && line.quantity), { numeric: true });



        if (documentNo || itemNo || material || plant || quantity) {

            return [documentNo, itemNo, material, plant, quantity].join('|');

        }

        return '';

    };



    const mergeQuotationLineRows = (existingRows, incomingRows) => {

        const merged = [];

        const indexByKey = new Map();

        const preferIncomingFields = new Set([

            'deliveryStatus',

            'pickingStatus',

            'pickingDate',

            'pickingBy',

            'pickingQty',

            'pickingMessage',

            'pgiStatus',

            'pgiDate',

            'pgiBy',

            'pgiDocument',

            'pgiMessage',

            'billingDate',

            'billingType',

            'netValue',

            'itemValue',

            'valueText',

            'taxAmount',

            'grossValue',

            'totalAmount',

            'quantity',

            'salesUnit',

            'unit',

            'currency'

        ]);



        const push = (rawRow) => {

            if (!rawRow || typeof rawRow !== 'object') {

                return;

            }



            const normalized = mapQuotationItem(rawRow);

            const hasSignals = !!(

                normalized.itemNo

                || normalized.material

                || normalized.matDesc

                || normalized.quantity

                || normalized.plant

                || normalized.netValue

            );

            if (!hasSignals) {

                return;

            }



            const key = buildQuotationLineKey(normalized);

            if (!key) {

                merged.push(normalized);

                return;

            }



            const index = indexByKey.get(key);

            if (index == null) {

                indexByKey.set(key, merged.length);

                merged.push(normalized);

                return;

            }



            const base = merged[index] || {};

            const patched = { ...base };

            for (const [field, value] of Object.entries(normalized)) {

                const text = String(value == null ? '' : value).trim();

                if (!text) {

                    continue;

                }

                if (preferIncomingFields.has(field)) {

                    patched[field] = value;

                    continue;

                }

                if (!String(patched[field] == null ? '' : patched[field]).trim()) {

                    patched[field] = value;

                }

            }

            merged[index] = patched;

        };



        for (const raw of (existingRows || [])) {

            push(raw);

        }

        for (const raw of (incomingRows || [])) {

            push(raw);

        }



        return merged;

    };



    const isLikelyQuotationLineItem = (raw) => {

        const line = raw || {};

        return !!(

            firstNonEmpty(line.DocumentNo, line.documentNo, line.DeliveryNo, line.deliveryNo, line.DeliveryDocument, line.deliveryDoc, line.BillingDoc, line.BillingDocument, line.billingDoc, line.billing)

            ||

            firstNonEmpty(line.ItemNo, line.itemNo)

            || firstNonEmpty(line.Material, line.material)

            || firstNonEmpty(line.MatDesc, line.matDesc, line.Description, line.description)

            || firstNonEmpty(line.Quantity, line.quantity, line.BilledQty, line.billedQty, line.BillingQty, line.billingQty)

            || firstNonEmpty(line.NetPrice, line.netPrice, line.ItemValue, line.itemValue, line.NetValue, line.netValue, line.GrossValue, line.grossValue, line.TotalAmount, line.totalAmount)

            || firstNonEmpty(line.ShipPoint, line.shipPoint)

            || firstNonEmpty(line.RefDoc, line.refDoc)

            || firstNonEmpty(line.PickingStatus, line.pickingStatus, line.PickStatus, line.pickStatus)

            || firstNonEmpty(line.PGIStatus, line.pgiStatus, line.PostGoodsIssueStatus, line.postGoodsIssueStatus)

            || firstNonEmpty(line.TaxAmount, line.taxAmount, line.GrossValue, line.grossValue, line.TotalAmount, line.totalAmount)

        );

    };



    const extractQuotationLineRows = (row) => {

        const r = row || {};

        const collected = [];

        const parentDocumentNo = firstNonEmpty(

            r.DocumentNo,

            r.documentNo,

            r.BillingDoc,

            r.BillingDocument,

            r.billingDoc,

            r.billing,

            r.Billing,

            r.DeliveryNo,

            r.DeliveryDocument,

            r.deliveryDoc,

            r.delivery

        );



        const attachParentDocumentNo = (line) => {

            if (!line || typeof line !== 'object' || !parentDocumentNo) {

                return line;

            }



            const existingDocumentNo = firstNonEmpty(

                line.DocumentNo,

                line.documentNo,

                line.BillingDoc,

                line.BillingDocument,

                line.billingDoc,

                line.deliveryDoc,

                line.delivery,

                line.DeliveryNo,

                line.DeliveryDocument

            );



            if (existingDocumentNo) {

                return line;

            }



            return Object.assign({

                DocumentNo: parentDocumentNo,

                documentNo: parentDocumentNo,

                BillingDoc: parentDocumentNo,

                BillingDocument: parentDocumentNo

            }, line);

        };



        const itItemsNode = r.ItItems || r.itItems || r.ItQuotationItems || r.itQuotationItems;

        const itRows = asArray(itItemsNode && (itItemsNode.item || itItemsNode.Item || itItemsNode));

        for (const it of itRows) {

            if (isLikelyQuotationLineItem(it)) {

                collected.push(attachParentDocumentNo(it));

            }

        }



        const directCandidates = [];

        if (Array.isArray(r.quotationItems)) {

            directCandidates.push(...r.quotationItems);

        }

        if (Array.isArray(r.lines)) {

            directCandidates.push(...r.lines);

        }

        if (Array.isArray(r.items)) {

            directCandidates.push(...r.items);

        }



        for (const it of directCandidates) {

            if (isLikelyQuotationLineItem(it)) {

                collected.push(attachParentDocumentNo(it));

            }

        }



        return mergeQuotationLineRows([], collected);

    };



    const buildQuotationCorrelationKeys = (row) => {

        const r = row || {};

        const rawKeys = [

            r.requestId,

            r.requestID,

            r.RequestId,

            r.soReqId,

            r.SoReqId,

            r.SoReqID,

            r.qtReqId,

            r.QtReqId,

            r.QT_REQ_ID,

            r.purchNoC,

            r.PurchNoC,

            r.Items,

            scalarText(r.items),

            r.quotationNo,

            r.QuotationNo,

            r.quotation,

            r.Quotation,

            r.salesOrder,

            r.SalesOrder,

            r.deliveryDoc,

            r.delivery,

            r.DeliveryNo,

            r.DeliveryDocument,

            r.documentNo,

            r.DocumentNo,

            r.batchId,

            r.batchID,

            r.BatchId,

            r.Batch_ID

        ];



        const keys = [];

        const seen = new Set();

        for (const value of rawKeys) {

            const text = scalarText(value);

            if (!text) {

                continue;

            }

            const key = text.toUpperCase();

            if (seen.has(key)) {

                continue;

            }

            seen.add(key);

            keys.push(key);

        }

        return keys;

    };



    const collectQuotationResultRows = (payloadLike) => {

        const p = payloadLike || {};

        if (!p || typeof p !== 'object') {

            return [];

        }



        const rows = [];

        const pushRow = (row) => {

            if (row && typeof row === 'object' && !Array.isArray(row)) {

                rows.push(row);

            }

        };



        const etResultsNode = p.EtResults || p.etResults || p.results;

        const etRows = asArray(etResultsNode && (etResultsNode.item || etResultsNode.Item || etResultsNode));

        etRows.forEach(pushRow);



        if (p.responses) {

            const responseRows = asArray(

                p.responses.item

                || p.responses.Item

                || p.responses.root

                || p.responses.Root

                || p.responses

            );

            responseRows.forEach(pushRow);

        }



        if (Array.isArray(p.items)) {

            p.items.forEach(pushRow);

        }



        return rows;

    };



    const buildQuotationRowLookup = (rows) => {

        const index = new Map();

        for (const row of (rows || [])) {

            for (const key of buildQuotationCorrelationKeys(row)) {

                if (!index.has(key)) {

                    index.set(key, row);

                }

            }

        }

        return index;

    };



    const pickMatchedQuotationRow = (row, index) => {

        if (!index || !(index instanceof Map) || index.size === 0) {

            return null;

        }

        for (const key of buildQuotationCorrelationKeys(row)) {

            if (index.has(key)) {

                return index.get(key);

            }

        }

        return null;

    };



    const extractBatchQuotationItems = (payload) => {

        const p = payload || {};

        const nested = parseNestedPayloadObject(p);

        const directRows = collectQuotationResultRows(p);

        const nestedRows = collectQuotationResultRows(nested);

        const nestedIndex = buildQuotationRowLookup(nestedRows);



        const mapResultRow = (rawRow, matchedDetailRow) => {

            const row = rawRow || {};

            const detailRow = matchedDetailRow || {};

            const lineRows = mergeQuotationLineRows(

                extractQuotationLineRows(detailRow),

                extractQuotationLineRows(row)

            );



            return {

                batchId: firstNonEmpty(row.batchId, row.batchID, row.BatchId, row.Batch_ID, detailRow.batchId, detailRow.Batch_ID),

                quotationNo: firstNonEmpty(

                    row.quotationNo,

                    row.QuotationNo,

                    row.quotation,

                    row.Quotation,

                    detailRow.quotationNo,

                    detailRow.QuotationNo,

                    detailRow.quotation,

                    detailRow.Quotation

                ),

                requestId: firstNonEmpty(

                    row.requestId,

                    row.requestID,

                    row.RequestId,

                    row.soReqId,

                    row.SoReqId,

                    row.SoReqID,

                    row.qtReqId,

                    row.QtReqId,

                    row.QT_REQ_ID,

                    row.purchNoC,

                    row.PurchNoC,

                    row.Items,

                    scalarText(row.items),

                    detailRow.requestId,

                    detailRow.requestID,

                    detailRow.RequestId,

                    detailRow.soReqId,

                    detailRow.SoReqId,

                    detailRow.SoReqID,

                    detailRow.qtReqId,

                    detailRow.QtReqId,

                    detailRow.QT_REQ_ID,

                    detailRow.purchNoC,

                    detailRow.PurchNoC,

                    detailRow.Items,

                    scalarText(detailRow.items),

                    row.batchId,

                    row.batchID,

                    row.Batch_ID

                ),

                salesOrder: firstNonEmpty(row.salesOrder, row.SalesOrder, detailRow.salesOrder, detailRow.SalesOrder),

                deliveryDoc: firstNonEmpty(row.deliveryDoc, row.delivery, row.DeliveryDocument, row.Delivery, detailRow.deliveryDoc, detailRow.DeliveryDocument),

                billingDoc: firstNonEmpty(row.billingDoc, row.billing, row.BillingDocument, row.Billing, detailRow.billingDoc, detailRow.BillingDocument),

                docType: firstNonEmpty(row.docType, row.DocType, detailRow.docType, detailRow.DocType),

                salesOrg: firstNonEmpty(row.salesOrg, row.SalesOrg, detailRow.salesOrg, detailRow.SalesOrg),

                distrChan: firstNonEmpty(row.distrChan, row.DistrChan, detailRow.distrChan, detailRow.DistrChan),

                division: firstNonEmpty(row.division, row.Division, detailRow.division, detailRow.Division),

                shipTo: firstNonEmpty(row.shipTo, row.ShipTo, detailRow.shipTo, detailRow.ShipTo),

                poNumber: firstNonEmpty(row.poNumber, row.poNo, row.PoNumber, row.PONumber, detailRow.poNumber, detailRow.PoNumber),

                reqDateH: firstNonEmpty(row.reqDateH, row.ReqDateH, row.reqDate, row.ReqDate, detailRow.reqDateH, detailRow.ReqDateH),

                status: firstNonEmpty(

                    row.callbackStatus,

                    row.status,

                    row.Status,

                    row.statusCode,

                    row.StatusCode,

                    row.MsgType,

                    row.msgType,

                    detailRow.callbackStatus,

                    detailRow.status,

                    detailRow.Status,

                    detailRow.MsgType,

                    detailRow.msgType

                ),

                message: firstNonEmpty(row.message, row.Message, row.MsgDesc, row.msgDesc, detailRow.message, detailRow.Message, detailRow.MsgDesc),

                callbackStep: firstNonEmpty(row.callbackStep, row.currentStage, row.stage, row.currentIFlow, row.currentIflow, row.step, detailRow.callbackStep),

                soldTo: firstNonEmpty(row.soldTo, row.SoldTo, detailRow.soldTo, detailRow.SoldTo),

                soldToName: firstNonEmpty(row.soldToName, row.SoldToName, detailRow.soldToName, detailRow.SoldToName),

                customerId: firstNonEmpty(row.customerId, detailRow.customerId),

                customerName: firstNonEmpty(row.customerName, detailRow.customerName),

                purchNoC: firstNonEmpty(row.purchNoC, row.PurchNoC, detailRow.purchNoC, detailRow.PurchNoC),

                netValue: firstNonEmpty(row.netValue, row.NetValue, detailRow.netValue, detailRow.NetValue),

                taxAmount: firstNonEmpty(row.taxAmount, row.TaxAmount, detailRow.taxAmount, detailRow.TaxAmount),

                grossValue: firstNonEmpty(row.grossValue, row.GrossValue, detailRow.grossValue, detailRow.GrossValue),

                currency: firstNonEmpty(row.currency, row.Currency, detailRow.currency, detailRow.Currency),

                validFrom: firstNonEmpty(row.validFrom, row.ValidFrom, detailRow.validFrom, detailRow.ValidFrom),

                validTo: firstNonEmpty(row.validTo, row.ValidTo, detailRow.validTo, detailRow.ValidTo),

                itemCount: toNumberOr(firstNonEmpty(row.itemCount, row.ItemCount, detailRow.itemCount, detailRow.ItemCount), lineRows.length || 0) || lineRows.length,

                createdBy: firstNonEmpty(row.createdBy, row.CreatedBy, detailRow.createdBy, detailRow.CreatedBy),

                createdAt: firstNonEmpty(row.createdAt, row.CreatedAt, detailRow.createdAt, detailRow.CreatedAt),

                items: lineRows,

                payload: matchedDetailRow ? Object.assign({}, detailRow, row) : row

            };

        };



        const sourceRows = directRows.length ? directRows : nestedRows;

        if (!sourceRows.length) {

            return [];

        }



        return sourceRows.map((baseRow) => {

            const matchedRow = pickMatchedQuotationRow(baseRow, nestedIndex);

            const mergedRow = matchedRow ? Object.assign({}, matchedRow, baseRow) : baseRow;

            return mapResultRow(mergedRow, matchedRow);

        });

    };



    const normalizeCreateQuotationBatchResult = (rawPayload, fallbackBatchId) => {

        if (!rawPayload || typeof rawPayload !== 'object') {

            return null;

        }



        const root = (rawPayload.value && typeof rawPayload.value === 'object')

            ? rawPayload.value

            : rawPayload;



        const etResultsNode = root.EtResults || root.etResults || root.results;

        const etResultsItems = asArray(etResultsNode && (etResultsNode.item || etResultsNode.Item || etResultsNode));

        const etReturnNode = root.EtReturn || root.etReturn || root.returns;

        const etReturnItems = asArray(etReturnNode && (etReturnNode.item || etReturnNode.Item || etReturnNode));



        const normalizedReturns = etReturnItems.map((rawRow) => {

            const row = rawRow || {};

            return {

                items: firstNonEmpty(row.Items, row.items),

                msgType: normalizeQuotationStatus(firstNonEmpty(row.MsgType, row.msgType)),

                msgDesc: firstNonEmpty(row.MsgDesc, row.msgDesc, row.Message, row.message)

            };

        }).filter((item) => item.items || item.msgDesc || item.msgType);



        if (!etResultsItems.length && !normalizedReturns.length) {

            return null;

        }



        const returnByItems = new Map();

        normalizedReturns.forEach((entry) => {

            const key = String(entry.items || '').trim().toUpperCase();

            if (!key || key === 'SUMMARY' || returnByItems.has(key)) {

                return;

            }

            returnByItems.set(key, entry);

        });



        const sourceRows = etResultsItems.length

            ? etResultsItems

            : normalizedReturns

                .filter((entry) => {

                    const key = String(entry.items || '').trim().toUpperCase();

                    return !!key && key !== 'SUMMARY';

                })

                .map((entry) => ({

                    quotationNo: entry.items,

                    QuotationNo: entry.items,

                    Status: entry.msgType,

                    Message: entry.msgDesc

                }));



        let successCount = 0;

        let failedCount = 0;

        let runningCount = 0;



        const responseItems = sourceRows.map((rawRow) => {

            const row = rawRow || {};

            const requestId = firstNonEmpty(

                row.requestId,

                row.requestID,

                row.RequestId,

                row.QtReqId,

                row.qtReqId,

                row.QT_REQ_ID,

                row.PurchNoC,

                row.purchNoC,

                row.Items,

                row.items

            );

            const quotationDoc = firstNonEmpty(

                row.QuotationNo,

                row.quotationNo,

                row.Quotation,

                row.quotation,

                row.SalesOrder,

                row.salesOrder

            );

            const quotationNo = firstNonEmpty(quotationDoc, 'UNKNOWN');

            const quotation = quotationDoc;



            const returnKeyCandidates = [

                requestId,

                quotationNo,

                quotation,

                row.QtReqId,

                row.qtReqId,

                row.QT_REQ_ID,

                row.PurchNoC,

                row.purchNoC,

                row.Items,

                row.items

            ].map((v) => String(v || '').trim().toUpperCase()).filter(Boolean);



            let matchedReturn = null;

            for (const key of returnKeyCandidates) {

                if (returnByItems.has(key)) {

                    matchedReturn = returnByItems.get(key);

                    break;

                }

            }



            const statusCode = normalizeQuotationStatus(firstNonEmpty(

                row.Status,

                row.status,

                row.statusCode,

                row.StatusCode,

                matchedReturn && matchedReturn.msgType,

                row.MsgType,

                row.msgType

            ));

            if (statusCode === 'ERROR') {

                failedCount += 1;

            } else if (statusCode === 'RUNNING') {

                runningCount += 1;

            } else {

                successCount += 1;

            }



            const itItemsNode = row.ItItems || row.itItems;

            const itemRows = asArray(itItemsNode && (itItemsNode.item || itItemsNode.Item || itItemsNode))

                .map(mapQuotationItem)

                .filter((line) => line.itemNo || line.material);



            const itemCount = toNumberOr(firstNonEmpty(row.ItemCount, row.itemCount), itemRows.length || 0) || itemRows.length;

            const message = firstNonEmpty(row.Message, row.message, matchedReturn && matchedReturn.msgDesc);



            return {

                requestId,

                quotationNo,

                quotation,

                salesOrder: '',

                status: statusCode,

                statusCode,

                quotationCompleted: statusCode === 'SUCCESS',

                currentIFlow: statusCode === 'SUCCESS'

                    ? 'IF_DCAP_O2C_ProcessSalesOrder: Completed'

                    : (statusCode === 'ERROR'

                        ? 'IF_DCAP_O2C_ProcessSalesOrder: Failed'

                        : 'IF_DCAP_O2C_ProcessSalesOrder: In Progress'),

                message: message || (quotation
                    ? (statusCode === 'ERROR'
                        ? `Quotation failed`
                        : `Quotation ${quotation} created successfully`)
                    : (statusCode === 'ERROR' ? 'Quotation processing failed' : 'Quotation processing update')),

                soldTo: firstNonEmpty(row.SoldTo, row.soldTo),

                soldToName: firstNonEmpty(row.SoldToName, row.soldToName),

                purchNoC: firstNonEmpty(row.PurchNoC, row.purchNoC),

                netValue: firstNonEmpty(row.NetValue, row.netValue),

                taxAmount: firstNonEmpty(row.TaxAmount, row.taxAmount),

                grossValue: firstNonEmpty(row.GrossValue, row.grossValue),

                currency: firstNonEmpty(row.Currency, row.currency),

                validFrom: firstNonEmpty(row.ValidFrom, row.validFrom),

                validTo: firstNonEmpty(row.ValidTo, row.validTo),

                createdBy: firstNonEmpty(row.CreatedBy, row.createdBy),

                createdAt: firstNonEmpty(row.CreatedAt, row.createdAt),

                itemCount,

                items: itemRows

            };

        });



        const summaryRow = normalizedReturns.find((row) => String(row.items || '').toUpperCase() === 'SUMMARY');

        const summaryMessage = firstNonEmpty(summaryRow && summaryRow.msgDesc);

        const totalCount = responseItems.length;



        let overallStatus = 'COMPLETED';

        if (totalCount > 0) {

            if (failedCount > 0 && successCount === 0 && runningCount === 0) {

                overallStatus = 'ERROR';

            } else if (failedCount > 0) {

                overallStatus = 'PARTIAL';

            } else if (runningCount > 0) {

                overallStatus = 'RUNNING';

            }

        } else {

            const summaryStatus = normalizeQuotationStatus(firstNonEmpty(

                summaryRow && summaryRow.msgType,

                root.Status,

                root.status,

                root.statusCode,

                root.StatusCode

            ));

            if (summaryStatus === 'ERROR') {

                overallStatus = 'ERROR';

            } else if (summaryStatus === 'RUNNING') {

                overallStatus = 'RUNNING';

            } else {

                overallStatus = 'COMPLETED';

            }

        }



        const batchId = firstNonEmpty(extractBatchIdFromAny(root), fallbackBatchId);

        const message = firstNonEmpty(

            summaryMessage,

            root.message,

            root.Message,

            (overallStatus === 'ERROR'

                ? `${failedCount}/${totalCount} quotation failed`

                : (overallStatus === 'PARTIAL'

                    ? `${successCount}/${totalCount} quotation succeeded, ${failedCount} failed`

                    : (totalCount > 0

                        ? `${successCount}/${totalCount} quotation created successfully`

                        : 'Quotation batch processed')))

        );



        return {

            batchId,

            currentIFlow: 'IF_DCAP_O2C_ProcessSalesOrder',

            status: overallStatus,

            message,

            totals: {

                total: totalCount,

                success: successCount,

                failed: failedCount,

                running: runningCount

            },

            etReturn: normalizedReturns,

            responses: {

                item: responseItems

            }

        };

    };



    const parseExpectedPoCountFromText = (text) => {

        const src = String(text || '');

        if (!src) {

            return 0;

        }

        const patterns = [

            /all\s+(\d+)\s+po(?:s)?\s+created\s+successfully/i,

            /created\s+(\d+)\s+po(?:s)?/i,

            /(\d+)\s*\/\s*(\d+)\s*po(?:s)?/i,

            /(\d+)\s+po(?:s)?\s+created/i

        ];



        for (const re of patterns) {

            const m = src.match(re);

            if (!m) {

                continue;

            }

            if (m.length >= 3 && m[2]) {

                return toNumberOr(m[2], 0);

            }

            if (m[1]) {

                return toNumberOr(m[1], 0);

            }

        }

        return 0;

    };



    const unwrapProcurementRoot = (raw) => {

        if (!raw || typeof raw !== 'object') {

            return raw;

        }



        const keys = Object.keys(raw);

        if (keys.length === 1) {

            const key = keys[0];

            const child = raw[key];

            if (child && typeof child === 'object' && (key.includes(':') || /response$/i.test(key))) {

                return child;

            }

        }

        return raw;

    };



    const extractXmlTagBlocks = (xmlText, tagName) => {

        const xml = String(xmlText || '');

        if (!xml || !tagName) {

            return [];

        }



        const re = new RegExp(`<\\s*(?:[^:>\\s]+:)?${tagName}\\b[^>]*>([\\s\\S]*?)<\\s*\\/\\s*(?:[^:>\\s]+:)?${tagName}\\s*>`, 'gi');

        const blocks = [];

        let match;



        while ((match = re.exec(xml)) !== null) {

            blocks.push(decodeXmlEntities(match[1] || ''));

        }



        return blocks;

    };



    const normalizePoProgressEntry = (item, parent) => {

        const it = item || {};

        const parentObj = parent || {};



        return {

            poReqId: firstNonEmpty(it.PoReqId, it.poReqId, parentObj.PoReqId, parentObj.poReqId),

            poNo: firstNonEmpty(it.PoNumber, it.poNo, it.poNumber, it.PurchaseOrder, it.purchaseOrder, it.EBELN, it.ebeln, parentObj.PoNumber, parentObj.poNumber),

            poItem: firstNonEmpty(it.PoItem, it.poItem),

            preqNo: firstNonEmpty(it.PreqNo, it.preqNo, it.prNo, parentObj.PreqNo, parentObj.preqNo),

            preqItem: firstNonEmpty(it.PreqItem, it.preqItem),

            salesOrder: firstNonEmpty(it.SalesOrder, it.salesOrder, parentObj.SalesOrder, parentObj.salesOrder),

            material: firstNonEmpty(it.Material, it.material),

            shortText: firstNonEmpty(it.ShortText, it.shortText),

            materialDesc: firstNonEmpty(it.MatDesc, it.matDesc, it.MaterialDesc, it.materialDesc),

            quantity: toNumberOr(firstNonEmpty(it.Quantity, it.quantity), 0),

            unit: firstNonEmpty(it.Unit, it.unit),

            netPrice: toNumberOr(firstNonEmpty(it.NetPrice, it.netPrice), 0),

            currency: firstNonEmpty(it.Currency, it.currency, parentObj.Currency, parentObj.currency),

            plant: firstNonEmpty(it.Plant, it.plant),

            plantDesc: firstNonEmpty(it.PlantDesc, it.plantDesc),

            storLoc: firstNonEmpty(it.StorLoc, it.storLoc),

            delivDate: firstNonEmpty(it.DelivDate, it.delivDate, it.deliveryDate),

            status: firstNonEmpty(it.Status, it.status, parentObj.Status, parentObj.status),

            vendor: firstNonEmpty(it.Vendor, it.vendor, parentObj.Vendor, parentObj.vendor),

            vendorName: firstNonEmpty(it.VendorName, it.vendorName, parentObj.VendorName, parentObj.vendorName),

            purchOrg: firstNonEmpty(it.PurchOrg, it.purchOrg, parentObj.PurchOrg, parentObj.purchOrg),

            purchOrgDesc: firstNonEmpty(it.PurchOrgDesc, it.purchOrgDesc),

            purGroup: firstNonEmpty(it.PurGroup, it.purGroup, parentObj.PurGroup, parentObj.purGroup),

            purGroupDesc: firstNonEmpty(it.PurGroupDesc, it.purGroupDesc),

            companyCode: firstNonEmpty(it.CompanyCode, it.companyCode, parentObj.CompanyCode, parentObj.companyCode),

            docType: firstNonEmpty(it.DocType, it.docType, parentObj.DocType, parentObj.docType),

            prType: firstNonEmpty(it.PrType, it.prType),

            soRef: firstNonEmpty(it.SoRef, it.soRef),

            soItemRef: firstNonEmpty(it.SoItemRef, it.soItemRef),

            createdAt: firstNonEmpty(it.CreatedAt, it.createdAt, parentObj.CreatedAt, parentObj.createdAt),

            createdBy: firstNonEmpty(it.CreatedBy, it.createdBy, parentObj.CreatedBy, parentObj.createdBy),

            message: firstNonEmpty(it.Message, it.message, parentObj.Message, parentObj.message)

        };

    };



    const classifyProcurementProgressEntry = (entry) => {

        const item = entry || {};

        const poNo = firstNonEmpty(item.poNo, item.purchaseOrder, item.ebeln);

        if (poNo) {

            return 'PO';

        }



        const preqNo = firstNonEmpty(item.preqNo, item.prNo, item.purchaseRequisition, item.prNumber);

        const preqItem = firstNonEmpty(item.preqItem, item.prItem);

        const material = firstNonEmpty(item.material, item.materialDesc, item.shortText);

        const hasQty = toNumberOr(item.quantity, 0) > 0;

        const hasOtherSignals = !!(preqItem || material || hasQty || firstNonEmpty(item.vendor, item.vendorName, item.delivDate, item.plant));



        if (preqNo && hasOtherSignals) {

            return 'PR';

        }



        if (!preqNo && (material || hasQty)) {

            return 'PR';

        }



        return '';

    };



    const pushParsedProcurementEntry = (parsed, normalizedEntry) => {

        if (!parsed || !normalizedEntry) {

            return;

        }



        const type = classifyProcurementProgressEntry(normalizedEntry);

        if (type === 'PO') {

            parsed.pos.push(normalizedEntry);

        } else if (type === 'PR') {

            parsed.prs.push(normalizedEntry);

        }

    };



    const normalizeProcurementLists = (rawPrs, rawPos) => {

        const prs = [];

        const pos = [];



        for (const raw of (rawPrs || [])) {

            const item = raw && typeof raw === 'object' ? raw : {};

            const type = classifyProcurementProgressEntry(item);

            if (type === 'PO') {

                pos.push(item);

            } else if (type === 'PR') {

                prs.push(item);

            }

        }



        for (const raw of (rawPos || [])) {

            const item = raw && typeof raw === 'object' ? raw : {};

            const type = classifyProcurementProgressEntry(item);

            if (type === 'PO') {

                pos.push(item);

            } else if (type === 'PR') {

                prs.push(item);

            }

        }



        return {

            prs: mergePoProgressLists([], prs),

            pos: mergePoProgressLists([], pos)

        };

    };



    const buildPoProgressKey = (entry) => {

        const poNo = firstNonEmpty(entry && entry.poNo, entry && entry.purchaseOrder, entry && entry.ebeln);

        const poItem = firstNonEmpty(entry && entry.poItem, '00000');

        const preqNo = firstNonEmpty(entry && entry.preqNo, entry && entry.prNo, entry && entry.purchaseRequisition, entry && entry.prNumber);

        const preqItem = firstNonEmpty(entry && entry.preqItem, '00000');

        const material = firstNonEmpty(entry && entry.material);



        if (poNo) {

            return ['PO', poNo, poItem, preqNo, preqItem].join('|').toUpperCase();

        }



        if (preqNo) {

            return ['PR', preqNo, preqItem].join('|').toUpperCase();

        }



        if (material) {

            return ['MAT', material, firstNonEmpty(entry && entry.plant)].join('|').toUpperCase();

        }



        return '';

    };



    const mergePoProgressLists = (existingPos, incomingPos) => {

        const merged = [];

        const indexByKey = new Map();



        for (const raw of (existingPos || [])) {

            const item = raw && typeof raw === 'object' ? raw : {};

            const key = buildPoProgressKey(item);

            if (!key || indexByKey.has(key)) {

                continue;

            }

            indexByKey.set(key, merged.length);

            merged.push(item);

        }



        for (const raw of (incomingPos || [])) {

            const item = raw && typeof raw === 'object' ? raw : {};

            const key = buildPoProgressKey(item);

            if (!key) {

                continue;

            }



            const idx = indexByKey.get(key);

            if (idx == null) {

                indexByKey.set(key, merged.length);

                merged.push(item);

                continue;

            }



            const base = merged[idx] || {};

            const patched = { ...base };

            for (const [field, value] of Object.entries(item)) {

                if (value == null) {

                    continue;

                }



                if (typeof value === 'number') {

                    const baseValue = toNumberOr(base[field], 0);

                    if (value > 0 || baseValue <= 0) {

                        patched[field] = value;

                    }

                    continue;

                }



                const text = String(value).trim();

                if (text) {

                    patched[field] = value;

                }

            }

            merged[idx] = patched;

        }



        return merged;

    };



    const countUniquePoDocs = (aPos) => {

        const set = new Set();

        for (const raw of (aPos || [])) {

            const item = raw || {};

            const code = firstNonEmpty(item.poNo, item.purchaseOrder, item.ebeln);

            if (code) {

                set.add(code);

            }

        }

        return set.size;

    };



    const parseProcurementProgressPayload = (rawPayload) => {

        let payloadObj = null;

        let payloadXml = '';



        if (typeof rawPayload === 'string') {

            const trimmed = rawPayload.trim();

            if (trimmed.startsWith('<')) {

                payloadXml = trimmed;

            } else {

                payloadObj = safeJsonParse(trimmed);

                if (!payloadObj && trimmed.includes('<')) {

                    payloadXml = trimmed;

                }

            }

        } else if (rawPayload && typeof rawPayload === 'object') {

            payloadObj = rawPayload;

        }



        const parsed = {

            salesOrder: '',

            prs: [],

            pos: [],

            expectedPoCount: 0,

            statusHint: '',

            message: '',

            summaryMsgType: '',

            summaryMsgDesc: ''

        };



        if (payloadObj) {

            const root = unwrapProcurementRoot(payloadObj);

            const etResults = root?.EtResults || root?.etResults || payloadObj.EtResults || payloadObj.etResults;

            const etReturn = root?.EtReturn || root?.etReturn || payloadObj.EtReturn || payloadObj.etReturn;

            const resultItems = asArray(etResults);



            for (const result of resultItems) {

                const itItems = asArray(result?.ItItems || result?.itItems);

                if (itItems.length) {

                    for (const it of itItems) {

                        const normalized = normalizePoProgressEntry(it, result);

                        pushParsedProcurementEntry(parsed, normalized);

                    }

                } else {

                    const normalized = normalizePoProgressEntry(result, result);

                    pushParsedProcurementEntry(parsed, normalized);

                }

            }



            const retItems = asArray(etReturn);

            const summary = retItems.find((r) => String(r?.Items || r?.items || '').toUpperCase() === 'SUMMARY') || retItems[retItems.length - 1] || {};

            parsed.summaryMsgType = firstNonEmpty(summary.MsgType, summary.msgType).toUpperCase();

            parsed.summaryMsgDesc = firstNonEmpty(summary.MsgDesc, summary.msgDesc);



            const allMessages = retItems.map((r) => firstNonEmpty(r.MsgDesc, r.msgDesc)).filter(Boolean);

            parsed.message = firstNonEmpty(parsed.summaryMsgDesc, allMessages[0]);

            parsed.expectedPoCount = toNumberOr(

                firstNonEmpty(root?.ExpectedPoCount, root?.expectedPoCount, payloadObj.expectedPoCount),

                0

            ) || parseExpectedPoCountFromText(parsed.message);



            parsed.salesOrder = firstNonEmpty(

                root?.SalesOrder,

                root?.salesOrder,

                payloadObj.SalesOrder,

                payloadObj.salesOrder,

                parsed.pos[0] && parsed.pos[0].salesOrder,

                parsed.prs[0] && parsed.prs[0].salesOrder

            );



            const statuses = ([]).concat(parsed.prs || [], parsed.pos || []).map((p) => firstNonEmpty(p.status).toUpperCase()).filter(Boolean);

            if (statuses.some((s) => s.includes('ERROR') || s.includes('FAIL') || s.includes('REJECT'))) {

                parsed.statusHint = 'ERROR';

            } else if (parsed.summaryMsgType === 'S' || statuses.some((s) => s.includes('SUCCESS') || s.includes('CREATED'))) {

                parsed.statusHint = 'SUCCESS';

            }



            return parsed;

        }



        if (payloadXml) {

            const itItemsBlocks = extractXmlTagBlocks(payloadXml, 'ItItems');

            const itemRe = /<\s*(?:[^:>\s]+:)?item\b[^>]*>([\s\S]*?)<\s*\/\s*(?:[^:>\s]+:)?item\s*>/gi;



            for (const block of itItemsBlocks) {

                itemRe.lastIndex = 0;

                let match;

                while ((match = itemRe.exec(block)) !== null) {

                    const rawItem = match[1] || '';

                    const normalized = normalizePoProgressEntry({

                        PoNumber: extractXmlTagValue(rawItem, 'PoNumber'),

                        PoItem: extractXmlTagValue(rawItem, 'PoItem'),

                        PreqNo: extractXmlTagValue(rawItem, 'PreqNo'),

                        PreqItem: extractXmlTagValue(rawItem, 'PreqItem'),

                        Material: extractXmlTagValue(rawItem, 'Material'),

                        MatDesc: extractXmlTagValue(rawItem, 'MatDesc') || extractXmlTagValue(rawItem, 'MaterialDesc'),

                        ShortText: extractXmlTagValue(rawItem, 'ShortText'),

                        Quantity: extractXmlTagValue(rawItem, 'Quantity'),

                        Unit: extractXmlTagValue(rawItem, 'Unit'),

                        NetPrice: extractXmlTagValue(rawItem, 'NetPrice'),

                        Currency: extractXmlTagValue(rawItem, 'Currency'),

                        Plant: extractXmlTagValue(rawItem, 'Plant'),

                        PlantDesc: extractXmlTagValue(rawItem, 'PlantDesc'),

                        StorLoc: extractXmlTagValue(rawItem, 'StorLoc'),

                        DelivDate: extractXmlTagValue(rawItem, 'DelivDate'),

                        Status: extractXmlTagValue(rawItem, 'Status')

                    }, {

                        SalesOrder: extractXmlTagValue(payloadXml, 'SalesOrder'),

                        Vendor: extractXmlTagValue(payloadXml, 'Vendor'),

                        VendorName: extractXmlTagValue(payloadXml, 'VendorName'),

                        PurchOrg: extractXmlTagValue(payloadXml, 'PurchOrg'),

                        PurGroup: extractXmlTagValue(payloadXml, 'PurGroup'),

                        CompanyCode: extractXmlTagValue(payloadXml, 'CompanyCode'),

                        DocType: extractXmlTagValue(payloadXml, 'DocType'),

                        CreatedBy: extractXmlTagValue(payloadXml, 'CreatedBy'),

                        CreatedAt: extractXmlTagValue(payloadXml, 'CreatedAt'),

                        Message: extractXmlTagValue(payloadXml, 'Message'),

                        PurchOrgDesc: extractXmlTagValue(payloadXml, 'PurchOrgDesc'),

                        PurGroupDesc: extractXmlTagValue(payloadXml, 'PurGroupDesc')

                    });



                    pushParsedProcurementEntry(parsed, normalized);

                }

            }



            parsed.salesOrder = firstNonEmpty(extractXmlTagValue(payloadXml, 'SalesOrder'));

            parsed.summaryMsgType = firstNonEmpty(extractXmlTagValue(payloadXml, 'MsgType')).toUpperCase();

            parsed.summaryMsgDesc = firstNonEmpty(extractXmlTagValue(payloadXml, 'MsgDesc'));

            parsed.message = firstNonEmpty(parsed.summaryMsgDesc, extractXmlTagValue(payloadXml, 'Message'));

            parsed.expectedPoCount = parseExpectedPoCountFromText(parsed.message);



            const statuses = ([]).concat(parsed.prs || [], parsed.pos || []).map((p) => firstNonEmpty(p.status).toUpperCase()).filter(Boolean);

            if (statuses.some((s) => s.includes('ERROR') || s.includes('FAIL') || s.includes('REJECT'))) {

                parsed.statusHint = 'ERROR';

            } else if (parsed.summaryMsgType === 'S' || statuses.some((s) => s.includes('SUCCESS') || s.includes('CREATED'))) {

                parsed.statusHint = 'SUCCESS';

            }

        }



        return parsed;

    };



    const parseExistingItemsContainer = (itemsJsonText) => {

        if (!itemsJsonText) {

            return { items: [], prs: [], pos: [], poCount: 0, expectedPoCount: 0, quotationDetail: {} };

        }



        const parsed = safeJsonParse(String(itemsJsonText));

        if (!parsed) {

            return { items: [], prs: [], pos: [], poCount: 0, expectedPoCount: 0, quotationDetail: {} };

        }



        if (Array.isArray(parsed)) {

            return { items: parsed, prs: [], pos: [], poCount: 0, expectedPoCount: 0, quotationDetail: {} };

        }



        const normalizedLists = normalizeProcurementLists(

            Array.isArray(parsed.prs) ? parsed.prs : [],

            Array.isArray(parsed.pos) ? parsed.pos : []

        );



        return {

            items: Array.isArray(parsed.items) ? parsed.items : [],

            prs: normalizedLists.prs,

            pos: normalizedLists.pos,

            poCount: toNumberOr(parsed.poCount, 0),

            expectedPoCount: toNumberOr(parsed.expectedPoCount, 0),

            quotationDetail: parsed.quotationDetail && typeof parsed.quotationDetail === 'object'

                ? parsed.quotationDetail

                : {}

        };

    };



    const sumQuotationItemQuantity = (items) => {

        let total = 0;

        for (const raw of (items || [])) {

            total += toNumberOr(firstNonEmpty(raw && raw.quantity, raw && raw.Quantity), 0);

        }

        return total;

    };



    const extractWarehouseItemsFromPayload = (payload) => {

        const p = payload || {};

        const nested = parseNestedPayloadObject(p);

        const collected = [];



        const pushFromSource = (source) => {

            if (!source || typeof source !== 'object') {

                return;

            }



            collected.push(...extractQuotationLineRows(source));



            const rows = collectQuotationResultRows(source);

            for (const row of rows) {

                collected.push(...extractQuotationLineRows(row));

            }

        };



        pushFromSource(p);

        pushFromSource(nested);



        if (nested && typeof nested === 'object') {

            const matchedNestedRow = pickMatchedQuotationRow(p, buildQuotationRowLookup(collectQuotationResultRows(nested)));

            if (matchedNestedRow) {

                collected.push(...extractQuotationLineRows(matchedNestedRow));

            }

        }



        return mergeQuotationLineRows([], collected);

    };



    const extractWarehouseDetailFromPayload = (payload) => {

        const p = payload || {};

        const nested = parseNestedPayloadObject(p);

        const nestedRows = collectQuotationResultRows(nested);

        const matchedNestedRow = pickMatchedQuotationRow(p, buildQuotationRowLookup(nestedRows)) || {};



        const detailSource = (matchedNestedRow && Object.keys(matchedNestedRow).length)

            ? matchedNestedRow

            : ((nested && typeof nested === 'object') ? nested : {});



        const items = extractWarehouseItemsFromPayload(p);

        const payloadText = stringifyPayloadSafe(

            p.payload || p.responsePayload || p.rawPayload || nested || p

        );



        return {

            requestId: firstNonEmpty(

                p.requestId,

                p.requestID,

                p.RequestId,

                p.qtReqId,

                p.QtReqId,

                p.QT_REQ_ID,

                p.purchNoC,

                p.PurchNoC,

                detailSource.requestId,

                detailSource.requestID,

                detailSource.RequestId,

                detailSource.qtReqId,

                detailSource.QtReqId,

                detailSource.QT_REQ_ID,

                detailSource.purchNoC,

                detailSource.PurchNoC,

                detailSource.Items,

                scalarText(detailSource.items)

            ),

            quotationNo: firstNonEmpty(

                p.quotationNo,

                p.quotation,

                p.quotationNumber,

                p.QuotationNo,

                p.Quotation,

                detailSource.quotationNo,

                detailSource.quotation,

                detailSource.QuotationNo,

                detailSource.Quotation

            ),

            soldTo: firstNonEmpty(p.soldTo, p.SoldTo, p.customerId, detailSource.soldTo, detailSource.SoldTo, detailSource.customerId),

            soldToName: firstNonEmpty(p.soldToName, p.SoldToName, p.customerName, detailSource.soldToName, detailSource.SoldToName, detailSource.customerName),

            customerId: firstNonEmpty(p.customerId, detailSource.customerId, p.soldTo, p.SoldTo, detailSource.soldTo, detailSource.SoldTo),

            customerName: firstNonEmpty(p.customerName, detailSource.customerName, p.soldToName, p.SoldToName, detailSource.soldToName, detailSource.SoldToName),

            purchNoC: firstNonEmpty(p.purchNoC, p.PurchNoC, detailSource.purchNoC, detailSource.PurchNoC),

            salesOrder: firstNonEmpty(p.salesOrder, p.SalesOrder, detailSource.salesOrder, detailSource.SalesOrder),

            docType: firstNonEmpty(p.docType, p.DocType, detailSource.docType, detailSource.DocType),

            salesOrg: firstNonEmpty(p.salesOrg, p.SalesOrg, detailSource.salesOrg, detailSource.SalesOrg),

            distrChan: firstNonEmpty(p.distrChan, p.DistrChan, detailSource.distrChan, detailSource.DistrChan),

            division: firstNonEmpty(p.division, p.Division, detailSource.division, detailSource.Division),

            shipTo: firstNonEmpty(p.shipTo, p.ShipTo, detailSource.shipTo, detailSource.ShipTo),

            poNumber: firstNonEmpty(p.poNumber, p.poNo, p.PoNumber, p.PONumber, detailSource.poNumber, detailSource.PoNumber),

            reqDateH: firstNonEmpty(p.reqDateH, p.ReqDateH, p.reqDate, p.ReqDate, detailSource.reqDateH, detailSource.ReqDateH),

            netValue: firstNonEmpty(p.netValue, p.NetValue, detailSource.netValue, detailSource.NetValue),

            taxAmount: firstNonEmpty(p.taxAmount, p.TaxAmount, detailSource.taxAmount, detailSource.TaxAmount),

            grossValue: firstNonEmpty(p.grossValue, p.GrossValue, detailSource.grossValue, detailSource.GrossValue),

            totalAmount: firstNonEmpty(p.totalAmount, p.TotalAmount, detailSource.totalAmount, detailSource.TotalAmount),

            currency: firstNonEmpty(p.currency, p.Currency, detailSource.currency, detailSource.Currency),

            deliveryDoc: firstNonEmpty(

                p.deliveryDoc,

                p.delivery,

                p.DeliveryDocument,

                p.Delivery,

                detailSource.deliveryDoc,

                detailSource.delivery,

                detailSource.DeliveryNo,

                detailSource.DeliveryDocument,

                detailSource.documentNo,

                detailSource.DocumentNo

            ),

            billingDoc: firstNonEmpty(

                p.billingDoc,

                p.billing,

                p.BillingDocument,

                p.Billing,

                detailSource.billingDoc,

                detailSource.billing,

                detailSource.BillingDocument,

                detailSource.BillingDoc

            ),

            billingDate: firstNonEmpty(

                p.billingDate,

                p.BillingDate,

                detailSource.billingDate,

                detailSource.BillingDate

            ),

            billingType: firstNonEmpty(

                p.billingType,

                p.BillingType,

                detailSource.billingType,

                detailSource.BillingType

            ),

            deliveryStatus: firstNonEmpty(

                p.deliveryStatus,

                p.DeliveryStatus,

                detailSource.deliveryStatus,

                detailSource.DeliveryStatus,

                p.status,

                p.Status,

                detailSource.status,

                detailSource.Status

            ),

            pickingStatus: firstNonEmpty(

                normalizeExecutionStatus(

                    firstNonEmpty(

                        p.pickingStatus,

                        p.PickingStatus,

                        p.pickStatus,

                        p.PickStatus,

                        p.pickingState,

                        p.PickingState,

                        detailSource.pickingStatus,

                        detailSource.PickingStatus,

                        detailSource.pickStatus,

                        detailSource.PickStatus,

                        detailSource.pickingState,

                        detailSource.PickingState

                    ),

                    firstNonEmpty(

                        p.pickingDate,

                        p.PickingDate,

                        p.pickDate,

                        p.PickDate,

                        p.pickingAt,

                        p.PickingAt,

                        detailSource.pickingDate,

                        detailSource.PickingDate,

                        detailSource.pickDate,

                        detailSource.PickDate,

                        detailSource.pickingAt,

                        detailSource.PickingAt

                    )

                ).code

            ),

            pickingDate: firstNonEmpty(

                p.pickingDate,

                p.PickingDate,

                p.pickDate,

                p.PickDate,

                p.pickingAt,

                p.PickingAt,

                detailSource.pickingDate,

                detailSource.PickingDate,

                detailSource.pickDate,

                detailSource.PickDate,

                detailSource.pickingAt,

                detailSource.PickingAt

            ),

            pickingBy: firstNonEmpty(

                p.pickingBy,

                p.PickingBy,

                p.pickBy,

                p.PickBy,

                p.pickingUser,

                p.PickingUser,

                detailSource.pickingBy,

                detailSource.PickingBy,

                detailSource.pickBy,

                detailSource.PickBy,

                detailSource.pickingUser,

                detailSource.PickingUser

            ),

            pgiStatus: firstNonEmpty(

                normalizeExecutionStatus(

                    firstNonEmpty(

                        p.pgiStatus,

                        p.PGIStatus,

                        p.postGoodsIssueStatus,

                        p.PostGoodsIssueStatus,

                        p.giStatus,

                        p.GIStatus,

                        p.pgiState,

                        p.PGIState,

                        detailSource.pgiStatus,

                        detailSource.PGIStatus,

                        detailSource.postGoodsIssueStatus,

                        detailSource.PostGoodsIssueStatus,

                        detailSource.giStatus,

                        detailSource.GIStatus,

                        detailSource.pgiState,

                        detailSource.PGIState

                    ),

                    firstNonEmpty(

                        p.pgiDate,

                        p.PGIDate,

                        p.postGoodsIssueDate,

                        p.PostGoodsIssueDate,

                        p.giDate,

                        p.GiDate,

                        p.pgiAt,

                        p.PGIAt,

                        p.actualGiDate,

                        p.ActualGiDate,

                        detailSource.pgiDate,

                        detailSource.PGIDate,

                        detailSource.postGoodsIssueDate,

                        detailSource.PostGoodsIssueDate,

                        detailSource.giDate,

                        detailSource.GiDate,

                        detailSource.pgiAt,

                        detailSource.PGIAt,

                        detailSource.actualGiDate,

                        detailSource.ActualGiDate

                    )

                ).code

            ),

            pgiDate: firstNonEmpty(

                p.pgiDate,

                p.PGIDate,

                p.postGoodsIssueDate,

                p.PostGoodsIssueDate,

                p.giDate,

                p.GiDate,

                p.pgiAt,

                p.PGIAt,

                detailSource.pgiDate,

                detailSource.PGIDate,

                detailSource.postGoodsIssueDate,

                detailSource.PostGoodsIssueDate,

                detailSource.giDate,

                detailSource.GiDate,

                detailSource.pgiAt,

                detailSource.PGIAt

            ),

            pgiBy: firstNonEmpty(

                p.pgiBy,

                p.PGIBy,

                p.postGoodsIssueBy,

                p.PostGoodsIssueBy,

                p.giBy,

                p.GiBy,

                p.pgiUser,

                p.PGIUser,

                detailSource.pgiBy,

                detailSource.PGIBy,

                detailSource.postGoodsIssueBy,

                detailSource.PostGoodsIssueBy,

                detailSource.giBy,

                detailSource.GiBy,

                detailSource.pgiUser,

                detailSource.PGIUser

            ),

            validFrom: firstNonEmpty(p.validFrom, p.ValidFrom, detailSource.validFrom, detailSource.ValidFrom),

            validTo: firstNonEmpty(p.validTo, p.ValidTo, detailSource.validTo, detailSource.ValidTo),

            createdBy: firstNonEmpty(p.createdBy, p.CreatedBy, detailSource.createdBy, detailSource.CreatedBy),

            createdAt: firstNonEmpty(p.createdAt, p.CreatedAt, detailSource.createdAt, detailSource.CreatedAt),

            itemCount: toNumberOr(firstNonEmpty(p.itemCount, p.ItemCount, detailSource.itemCount, detailSource.ItemCount), items.length || 0) || items.length,

            message: firstNonEmpty(

                p.message,

                p.Message,

                p.msgDesc,

                p.MsgDesc,

                detailSource.message,

                detailSource.Message,

                detailSource.msgDesc,

                detailSource.MsgDesc

            ),

            callbackStep: firstNonEmpty(

                p.callbackStep,

                p.currentStage,

                p.stage,

                p.currentIFlow,

                p.currentIflow,

                detailSource.callbackStep,

                detailSource.currentStage,

                detailSource.stage,

                detailSource.currentIFlow,

                detailSource.currentIflow

            ),

            callbackStatus: firstNonEmpty(

                p.callbackStatus,

                p.status,

                p.Status,

                detailSource.callbackStatus,

                detailSource.status,

                detailSource.Status

            ),

            workflowInstanceId: firstNonEmpty(

                p.workflowInstanceId,

                p.workflowId,

                p.WorkflowInstanceId,

                detailSource.workflowInstanceId,

                detailSource.workflowId,

                detailSource.WorkflowInstanceId

            ),

            payload: payloadText,

            items

        };

    };



    const mergeQuotationDetailMeta = (existingMeta, incomingMeta, fallbackMeta) => {

        const base = (existingMeta && typeof existingMeta === 'object') ? existingMeta : {};

        const incoming = (incomingMeta && typeof incomingMeta === 'object') ? incomingMeta : {};

        const fallback = (fallbackMeta && typeof fallbackMeta === 'object') ? fallbackMeta : {};

        const merged = { ...base };



        const fields = [

            'requestId',

            'quotationNo',

            'salesOrder',

            'soldTo',

            'soldToName',

            'customerId',

            'customerName',

            'purchNoC',

            'docType',

            'salesOrg',

            'distrChan',

            'division',

            'shipTo',

            'poNumber',

            'reqDateH',

            'netValue',

            'taxAmount',

            'grossValue',

            'totalAmount',

            'currency',

            'validFrom',

            'validTo',

            'createdBy',

            'createdAt',

            'message',

            'payload',

            'callbackStep',

            'callbackStatus',

            'workflowInstanceId',

            'deliveryDoc',

            'billingDoc',

            'billingDate',

            'billingType',

            'deliveryStatus',

            'pickingStatus',

            'pickingDate',

            'pickingBy',

            'pgiStatus',

            'pgiDate',

            'pgiBy'

        ];



        for (const field of fields) {

            const value = firstNonEmpty(incoming[field], base[field], fallback[field]);

            if (value) {

                merged[field] = value;

            }

        }



        const mergedItems = mergeQuotationLineRows(base.items || [], incoming.items || []);

        if (mergedItems.length) {

            merged.items = mergedItems;

        }



        const mergedItemCount = toNumberOr(

            firstNonEmpty(incoming.itemCount, base.itemCount, fallback.itemCount),

            mergedItems.length || 0

        ) || mergedItems.length;

        if (mergedItemCount > 0) {

            merged.itemCount = mergedItemCount;

        }



        merged.customerId = firstNonEmpty(merged.customerId, merged.soldTo, fallback.customerId);

        merged.customerName = firstNonEmpty(merged.customerName, merged.soldToName, fallback.customerName);

        merged.soldTo = firstNonEmpty(merged.soldTo, merged.customerId);

        merged.soldToName = firstNonEmpty(merged.soldToName, merged.customerName);



        return merged;

    };



    const resolveProcurementTracking = ({

        explicitStatus,

        parsedStatus,

        completedPoCount,

        expectedPoCount,

        hasAnyPos,

        hasAnyPr,

        callbackStep

    }) => {

        const raw = String(firstNonEmpty(explicitStatus, parsedStatus)).toUpperCase();

        const hasError = raw.includes('ERROR') || raw.includes('FAIL') || raw.includes('REJECT');

        const expected = toNumberOr(expectedPoCount, 0);

        const completed = toNumberOr(completedPoCount, 0);

        const reachedTarget = expected > 0 && completed >= expected;

        const successHint = raw.includes('SUCCESS') || raw.includes('COMPLETED') || raw === 'S';

        const completedByHint = successHint && hasAnyPos && (expected <= 0 || completed >= expected);



        if (hasError) {

            return {

                statusCode: 'ERROR',

                statusText: 'Lỗi tạo PO',

                currentStage: callbackStep || 'IF_Worker_Create_PO_From_PR_After_Approval: Failed'

            };

        }



        if (reachedTarget || completedByHint) {

            return {

                statusCode: 'SUCCESS',

                statusText: 'Đã tạo đủ PO',

                currentStage: 'IF_Worker_Create_PO_From_PR_After_Approval: Completed'

            };

        }



        if (successHint && hasAnyPr && !hasAnyPos) {

            return {

                statusCode: 'RUNNING',

                statusText: 'Da tao PR, cho tao PO',

                currentStage: callbackStep || 'IF_Worker_Create_PRs_From_SO: Completed'

            };

        }



        return {

            statusCode: 'RUNNING',

            statusText: 'Đang tạo PO',

            currentStage: callbackStep || 'IF_Worker_Create_PO_From_PR_After_Approval: In Progress'

        };

    };



    const pickRequestQuantity = (payloadData) => {

        if (!payloadData || typeof payloadData !== 'object') {

            return 0;

        }

        return toNumberOr(payloadData.Quantity || payloadData.quantity || payloadData.qty, 0);

    };



    const pickRequestItemCount = (payloadData) => {

        if (!payloadData || typeof payloadData !== 'object') {

            return 0;

        }

        if (Array.isArray(payloadData.Order)) {

            return payloadData.Order.length;

        }

        if (Array.isArray(payloadData.orders)) {

            return payloadData.orders.length;

        }

        if (Array.isArray(payloadData.IT_ITEMS)) {

            return payloadData.IT_ITEMS.length;

        }

        return 1;

    };



    const persistCpiFailure = async ({ payloadData, endpoint, errorMessage, processTypeHint }) => {

        const nowIso = new Date().toISOString();

        const quotationNo = firstNonEmpty(

            payloadData && (payloadData.QT_REQ_ID || payloadData.qtReqId),

            payloadData && (payloadData.quotationNo || payloadData.quotation),

            payloadData && (payloadData.PO || payloadData.po || payloadData.OrderNo || payloadData.orderId),

            payloadData && (payloadData.Material || payloadData.material),

            `REQ_${Date.now()}`

        );



        const processType = firstNonEmpty(

            processTypeHint,

            payloadData && payloadData.processType,

            isDispatcherPayload(payloadData) ? 'SO_PROCUREMENT' : 'SD_OTC'

        );



        const recordId = buildProcessingRecordId(`FAIL_${randomUUID()}`, quotationNo);

        const safeError = clipText(String(errorMessage || 'Unknown CPI error'), 600);

        const safeMessage = clipText(

            `CPI/S4 unavailable at endpoint ${endpoint || 'unknown'}. Error: ${safeError}`,

            600

        );



        const entry = {

            ID: recordId,

            batchId: '',

            quotationNo,

            customerId: '',

            customerName: '',

            processType,

            uploadMethod: 'SYSTEM',

            uploadType: payloadData.uploadType || payloadData.fileType || '',

            currentStage: 'CPI call failed before callback',

            statusCode: 'ERROR',

            statusText: 'CPI/S4 unavailable',

            salesOrder: '',

            delivery: '',

            billing: '',

            message: safeMessage,

            totalItems: pickRequestItemCount(payloadData),

            totalQuantity: pickRequestQuantity(payloadData),

            itemsJson: JSON.stringify({

                failedAt: nowIso,

                endpoint,

                error: safeError,

                payload: payloadData || {}

            }),

            uploadAt: nowIso,

            completedAt: null,

            createdAt: nowIso,

            updatedAt: nowIso,

            createdBy: 'integration-fallback'

        };



        await INSERT.into(ProcessingQuotations).entries(entry);

        return entry;

    };



    const normalizeLookupCode = (value) => String(value == null ? '' : value).trim().toUpperCase();



    const parseProcurementCodesFromContainer = (itemsContainer) => {

        const parsed = itemsContainer || {};

        const normalized = normalizeProcurementLists(

            Array.isArray(parsed.prs) ? parsed.prs : [],

            Array.isArray(parsed.pos) ? parsed.pos : []

        );

        const prs = normalized.prs;

        const pos = normalized.pos;

        const preqSet = new Set();



        const pushPreq = (value) => {

            const code = normalizeLookupCode(value);

            if (code) {

                preqSet.add(code);

            }

        };



        for (const p of prs) {

            pushPreq(p && (p.preqNo || p.prNo || p.purchaseRequisition || p.prNumber));

        }



        for (const p of pos) {

            pushPreq(p && (p.preqNo || p.prNo || p.purchaseRequisition || p.prNumber));

        }



        return {

            preqSet,

            prCount: prs.length

        };

    };



    const sanitizeCallbackMessage = (message) => {
        const parts = String(message || '')
            .split('|')
            .map((p) => String(p || '').trim())
            .filter(Boolean)
            .filter((p) => !/^source\s*=\s*/i.test(p) && !/^step\s*=\s*/i.test(p))
            .map((p) => {
                // Xóa prefix có dạng "AGnwxWC9_gwXqIuaglUnEU1Fs3hU: " khỏi message
                return p.replace(/^[A-Za-z0-9_-]+:\s*/, '');
            });

        const seen = new Set();
        const unique = [];
        for (const part of parts) {
            const key = part.toLowerCase();
            if (seen.has(key)) {
                continue;
            }
            seen.add(key);
            unique.push(part);
        }

        return unique.slice(0, 3).join(' | ');
    };



    const isDbAcquireTimeoutError = (error) => {

        const name = String((error && error.name) || '');

        const message = String((error && error.message) || '');

        return name === 'TimeoutError' || /ResourceRequest timed out/i.test(message);

    };



    const waitFor = (ms) => new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));



    const withDbAcquireRetry = async (operation, options) => {

        const fn = typeof operation === 'function' ? operation : null;

        if (!fn) {

            throw new Error('withDbAcquireRetry requires an operation function');

        }



        const maxRetries = Math.max(0, Number(options && options.retries) || 0);

        const baseDelayMs = Math.max(0, Number(options && options.baseDelayMs) || 120);



        let attempt = 0;

        while (true) {

            try {

                return await fn();

            } catch (error) {

                if (!isDbAcquireTimeoutError(error) || attempt >= maxRetries) {

                    throw error;

                }



                attempt += 1;

                const backoffMs = baseDelayMs * attempt;

                console.warn(`[DB] Pool acquire timeout, retry ${attempt}/${maxRetries} in ${backoffMs}ms`);

                await waitFor(backoffMs);

            }

        }

    };



    this.on('loginStaff', async (req) => {

        const username = normalizeStaffEmail(req.data && req.data.username);

        const password = String((req.data && req.data.password) || '');



        if (!username || !password) {

            return {

                success: false,

                message: 'Vui long nhap day du ten dang nhap va mat khau.',

                email: '',

                fullName: '',

                role: ''

            };

        }



        let user;

        try {

            user = await SELECT.one.from(StaffUsers).where({ email: username, isActive: true });

        } catch (error) {

            const errorMessage = error && error.message ? error.message : String(error || 'Unknown error');

            console.error('[Auth] loginStaff DB lookup failed:', errorMessage);



            if (isDbAcquireTimeoutError(error)) {

                return {

                    success: false,

                    message: 'He thong tam thoi qua tai. Vui long thu lai sau it giay.',

                    email: '',

                    fullName: '',

                    role: ''

                };

            }



            return {

                success: false,

                message: 'He thong dang ban. Vui long thu lai sau.',

                email: '',

                fullName: '',

                role: ''

            };

        }



        if (!user) {

            return {

                success: false,

                message: 'Ten dang nhap hoac mat khau khong dung.',

                email: '',

                fullName: '',

                role: ''

            };

        }



        if (String(user.role || '').toUpperCase() !== 'STAFF') {

            return {

                success: false,

                message: 'Tai khoan khong thuoc nhom Staff.',

                email: '',

                fullName: '',

                role: ''

            };

        }



        if (!verifyStaffPassword(password, user.passwordHash)) {

            return {

                success: false,

                message: 'Ten dang nhap hoac mat khau khong dung.',

                email: '',

                fullName: '',

                role: ''

            };

        }



        return {

            success: true,

            message: 'Dang nhap thanh cong.',

            email: user.email,

            fullName: user.fullName || user.email,

            role: 'STAFF'

        };

    });



    /**

     * Action: importOrders

     * Description: Receives Base64 Excel content, parses it, and creates Orders/Items in the DB.

     */

    this.on('importOrders', async (req) => {

        const { fileContent, flowType } = req.data;

        const sFlowType = String(flowType || 'sales').trim().toLowerCase();



        if (!fileContent) {

            return req.error(400, 'No file content provided');

        }



        try {

            // Calculate default delivery date based on flowType
            const today = new Date();
            let defaultDeliveryDate = new Date(today);

            if (sFlowType === 'procurement') {
                // Procurement: today + 3 months
                defaultDeliveryDate.setMonth(defaultDeliveryDate.getMonth() + 3);
            } else {
                // Sales: today + 3 days (default)
                defaultDeliveryDate.setDate(defaultDeliveryDate.getDate() + 3);
            }

            const formattedDefaultDeliveryDate = formatDateOnly(defaultDeliveryDate);

            // 1. Decode Base64 to Buffer

            const buffer = Buffer.from(fileContent, 'base64');



            // 2. Parse Excel WorkBook

            const workbook = XLSX.read(buffer, { type: 'buffer' });



            // Assume first sheet contains the data

            const sheetName = workbook.SheetNames[0];

            const worksheet = workbook.Sheets[sheetName];



            // Convert to JSON (Header: A, B, C...)

            // Standardizing: Assume Row 1 is Header.

            const data = XLSX.utils.sheet_to_json(worksheet);



            if (!data || data.length === 0) {

                return req.error(400, 'Excel file is empty');

            }



            // 3. Map Data to Entities - Support new Excel structure

            // New structure: DocType, Material, Quantity, Plant, SoldToParty, SalesOrg, etc.



            console.log('[importOrders] Raw Excel data:', JSON.stringify(data[0], null, 2));



            const ordersMap = new Map();



            data.forEach((row, index) => {

                // Support both old and new column names

                const orderId = row['Order ID'] || row['OrderNo'] || row['PO'] || `ORD-${Date.now()}-${index}`;

                const partNo = row['Material'] || row['Part No'] || 'PART-001';

                const qty = row['Quantity'] || row['Qty'] || 1;

                const price = row['Price'] || row['Unit Price'] || 100;

                const plant = row['Plant'] || row['plant'] || 'FU24';

                const customer = row['SoldToParty'] || row['Customer'] || '1003209';

                const salesOrg = row['SalesOrg'] || row['SalesOrganization'] || 'FU24';

                // Auto-fill DeliveryDate if empty
                const deliveryDate = String(row['Delivery Date'] || row['DeliveryDate'] || '').trim()
                    ? String(row['Delivery Date'] || row['DeliveryDate']).trim()
                    : formattedDefaultDeliveryDate;



                if (!ordersMap.has(orderId)) {

                    ordersMap.set(orderId, {

                        id: orderId,

                        createdBy: 'Manager',

                        createdAt: formatDateOnly(),

                        fileName: 'Imported_Excel.xlsx',

                        totalAmount: 0,

                        status: 'Pending',

                        rejectionComment: null,

                        customer: customer,

                        salesOrg: salesOrg,

                        items: []

                    });

                }



                const order = ordersMap.get(orderId);

                const itemTotal = qty * price;



                order.items.push({

                    partNo: partNo,

                    desc: row['Description'] || row['MaterialDescription'] || partNo,

                    qty: `${qty}`,

                    price: `${price}`,

                    total: `${itemTotal}`,

                    plant: plant,
                    deliveryDate: deliveryDate

                });



                order.totalAmount = (parseFloat(order.totalAmount) + itemTotal).toFixed(2);

            });



            const newOrders = Array.from(ordersMap.values());



            // 4. Insert into DB

            console.log(`[importOrders] Parsed ${newOrders.length} orders from Excel with flowType: ${sFlowType}`);

            console.log('[importOrders] First order structure:', JSON.stringify(newOrders[0], null, 2));



            await INSERT.into(Orders).entries(newOrders);



            return newOrders;



        } catch (error) {

            console.error('Excel Parsing Error:', error);

            return req.error(500, 'Failed to parse Excel file: ' + error.message);

        }

    });



    /**

     * Action: sendToCPI

     * Receives a JSON string payload (one row from Excel),

     * calls CPI /http/sales-order, returns SalesOrder + DeliveryDocument.

     */

    this.on('sendToCPI', async (req) => {

        const { payload, payloadType, uploadType, fileName } = req.data;



        if (!payload) {

            return req.error(400, 'No payload provided');

        }



        const bCsvPayload = isCsvPayloadRequest({ payloadType, uploadType, payload });

        let data;

        let endpoint;

        let cpiCallOptions;



        if (bCsvPayload) {

            const rawPayload = String(payload || '');

            if (isLikelyLegacyCsvJsonPayload(rawPayload)) {

                let legacyObject;

                try {

                    legacyObject = JSON.parse(rawPayload);

                } catch (error) {

                    return req.error(400, 'Invalid legacy CSV JSON payload');

                }

                data = buildCsvFromLegacyPayload(legacyObject);

            } else {

                data = rawPayload;

            }

            endpoint = CPI_CONFIG.endpoints.csvImport || CPI_CONFIG.endpoints.dispatcher || CPI_CONFIG.endpoints.salesOrder;

            cpiCallOptions = {

                contentType: 'text/csv',

                headers: {

                    uploadType: 'CSV',

                    fileType: 'CSV',

                    'x-upload-type': 'CSV',

                    'x-file-type': 'CSV',

                    'x-file-name': String(fileName || '').trim()

                }

            };

        } else {

            try {

                data = JSON.parse(payload);

            } catch (error) {

                return req.error(400, 'Invalid JSON payload');

            }



            endpoint = isDispatcherPayload(data)

                ? (CPI_CONFIG.endpoints.dispatcher || CPI_CONFIG.endpoints.salesOrder)

                : CPI_CONFIG.endpoints.salesOrder;

            cpiCallOptions = { contentType: 'application/json' };

        }



        try {

            console.log('[sendToCPI] Sending to CPI:', JSON.stringify(data, null, 2));



            // Call CPI

            const cpiResponse = await callCPI(endpoint, data, cpiCallOptions);

            console.log('[sendToCPI] CPI raw response:', JSON.stringify(cpiResponse, null, 2));



            const normalized = normalizeCpiResult(cpiResponse);

            const timestamp = new Date().toISOString();



            console.log(`[sendToCPI] Parsed - SO: ${normalized.salesOrder}, Delivery: ${normalized.delivery}, Billing: ${normalized.billing}, Status: ${normalized.status}, Batch: ${normalized.batchId}`);



            return {

                salesOrder: normalized.salesOrder,

                delivery: normalized.delivery,

                billing: normalized.billing,

                batchId: normalized.batchId,

                currentIFlow: normalized.currentIFlow,

                status: normalized.status,

                message: normalized.message,

                responsePayload: JSON.stringify(cpiResponse),

                material: bCsvPayload ? '' : (data.Material || data.material || ''),

                quantity: bCsvPayload ? 0 : pickRequestQuantity(data),

                timestamp: timestamp

            };



        } catch (error) {

            console.error('[sendToCPI] Error:', error.message);

            let persisted = null;

            try {

                persisted = await persistCpiFailure({

                    payloadData: bCsvPayload

                        ? { uploadType: 'CSV', fileType: 'CSV', rawCsvPayload: data }

                        : data,

                    endpoint,

                    errorMessage: error.message,

                    processTypeHint: bCsvPayload ? 'SO_PROCUREMENT' : (isDispatcherPayload(data) ? 'SO_PROCUREMENT' : 'SD_OTC')

                });

            } catch (persistError) {

                console.error('[sendToCPI] Persist fallback failed:', persistError.message);

            }



            const timestamp = new Date().toISOString();

            const fallbackMsg = persisted

                ? `CPI loi. Da luu request de retry. Ref: ${persisted.ID}`

                : `CPI loi va khong the luu fallback: ${error.message}`;



            return {

                salesOrder: 'N/A',

                delivery: 'N/A',

                billing: 'N/A',

                batchId: '',

                currentIFlow: 'Main Dispatcher',

                status: 'ERROR_PERSISTED',

                message: fallbackMsg,

                responsePayload: JSON.stringify({

                    error: error.message,

                    persistedId: persisted && persisted.ID

                }),

                material: bCsvPayload ? '' : (data.Material || data.material || ''),

                quantity: bCsvPayload ? 0 : pickRequestQuantity(data),

                timestamp

            };

        }

    });



    this.on('sendToCPIAsync', async (req) => {

        const { payload, payloadType, uploadType, fileName } = req.data;



        if (!payload) {

            return req.error(400, 'No payload provided');

        }



        const bCsvPayload = isCsvPayloadRequest({ payloadType, uploadType, payload });

        let data;

        let endpoint;

        let cpiCallOptions;



        if (bCsvPayload) {

            const rawPayload = String(payload || '');

            if (isLikelyLegacyCsvJsonPayload(rawPayload)) {

                let legacyObject;

                try {

                    legacyObject = JSON.parse(rawPayload);

                } catch (error) {

                    return req.error(400, 'Invalid legacy CSV JSON payload');

                }

                data = buildCsvFromLegacyPayload(legacyObject);

            } else {

                data = rawPayload;

            }

            endpoint = CPI_CONFIG.endpoints.csvImport || CPI_CONFIG.endpoints.dispatcher || CPI_CONFIG.endpoints.salesOrder;

            cpiCallOptions = {

                contentType: 'text/csv',

                headers: {

                    uploadType: 'CSV',

                    fileType: 'CSV',

                    'x-upload-type': 'CSV',

                    'x-file-type': 'CSV',

                    'x-file-name': String(fileName || '').trim()

                }

            };

        } else {

            try {

                data = JSON.parse(payload);

            } catch (error) {

                return req.error(400, 'Invalid JSON payload');

            }

            endpoint = CPI_CONFIG.endpoints.dispatcher || CPI_CONFIG.endpoints.salesOrder;

            cpiCallOptions = { contentType: 'application/json' };

        }



        try {

            const cpiResponse = await callCPI(endpoint, data, cpiCallOptions);

            const extractedBatchId = extractBatchIdFromAny(cpiResponse);

            const requestId = extractedBatchId || randomUUID();

            const normalizedQuotationBatch = normalizeCreateQuotationBatchResult(cpiResponse, extractedBatchId);



            if (normalizedQuotationBatch) {

                const normalizedBatchId = firstNonEmpty(normalizedQuotationBatch.batchId, extractedBatchId);

                const normalizedItems = normalizedQuotationBatch.responses && Array.isArray(normalizedQuotationBatch.responses.item)

                    ? normalizedQuotationBatch.responses.item

                    : [];

                return {

                    requestId: normalizedBatchId || requestId,

                    batchId: normalizedBatchId,

                    currentIFlow: normalizedQuotationBatch.currentIFlow || 'IF_DCAP_O2C_ProcessSalesOrder',

                    status: normalizedQuotationBatch.status || (normalizedItems.length ? 'COMPLETED' : 'RUNNING'),

                    message: normalizedQuotationBatch.message || 'CPI da tra ket qua tao quotation',

                    responsePayload: JSON.stringify(normalizedQuotationBatch),

                    timestamp: new Date().toISOString()

                };

            }



            const hasDetailedItems = Array.isArray(cpiResponse?.responses?.item)

                || Array.isArray(cpiResponse?.responses?.root)

                || Array.isArray(cpiResponse?.item)

                || Array.isArray(cpiResponse?.root)

                || Array.isArray(cpiResponse?.EtResults?.item)

                || Array.isArray(cpiResponse?.etResults?.item)

                || (cpiResponse?.responses?.item && typeof cpiResponse.responses.item === 'object')

                || (cpiResponse?.responses?.root && typeof cpiResponse.responses.root === 'object')

                || (cpiResponse?.item && typeof cpiResponse.item === 'object')

                || (cpiResponse?.root && typeof cpiResponse.root === 'object')

                || (cpiResponse?.EtResults?.item && typeof cpiResponse.EtResults.item === 'object')

                || (cpiResponse?.etResults?.item && typeof cpiResponse.etResults.item === 'object');



            if (hasDetailedItems) {

                return {

                    requestId,

                    batchId: extractedBatchId,

                    currentIFlow: 'IF_DCAP_O2C_ProcessSalesOrder',

                    status: 'COMPLETED',

                    message: extractedBatchId

                        ? `CPI da tra ket qua chi tiet. Batch_ID: ${extractedBatchId}`

                        : 'CPI da tra ket qua chi tiet',

                    responsePayload: JSON.stringify(cpiResponse),

                    timestamp: new Date().toISOString()

                };

            }



            return {

                requestId,

                batchId: extractedBatchId,

                currentIFlow: 'Main Dispatcher',

                status: 'QUEUED',

                message: extractedBatchId

                    ? `Da gui CPI thanh cong. Batch_ID: ${extractedBatchId}`

                    : 'Da gui CPI thanh cong',

                responsePayload: '',

                timestamp: new Date().toISOString()

            };

        } catch (error) {

            console.error('[sendToCPIAsync] Error:', error.message);

            let persisted = null;

            try {

                persisted = await persistCpiFailure({

                    payloadData: bCsvPayload

                        ? { uploadType: 'CSV', fileType: 'CSV', rawCsvPayload: data }

                        : data,

                    endpoint,

                    errorMessage: error.message,

                    processTypeHint: 'SO_PROCUREMENT'

                });

            } catch (persistError) {

                console.error('[sendToCPIAsync] Persist fallback failed:', persistError.message);

            }



            return {

                requestId: (persisted && persisted.ID) || randomUUID(),

                batchId: '',

                currentIFlow: 'Main Dispatcher',

                status: 'ERROR_PERSISTED',

                message: persisted

                    ? `CPI loi. Da luu request de retry. Ref: ${persisted.ID}`

                    : `CPI loi va khong the luu fallback: ${error.message}`,

                responsePayload: JSON.stringify({

                    error: error.message,

                    persistedId: persisted && persisted.ID

                }),

                timestamp: new Date().toISOString()

            };

        }

    });



    const handleWarehouseProgress = async (payloadInput) => {

        const payload = payloadInput || {};

        const batchId = String(payload.batchId || payload.batchID || payload.BatchId || '').trim();

        const rawQuotationNo = String(

            payload.quotationNo || payload.quotation || payload.quotationNumber || payload.QuotationNo || ''

        ).trim();

        const requestId = String(

            payload.requestId || payload.requestID || payload.RequestId || payload.qtReqId || payload.QtReqId || payload.QT_REQ_ID || ''

        ).trim();

        const salesOrder = String(payload.salesOrder || payload.salesorder || payload.SalesOrder || '').trim();

        const deliveryDoc = String(

            payload.deliveryDoc || payload.delivery || payload.DeliveryDocument || payload.Delivery || ''

        ).trim();

        const billingDoc = String(payload.billingDoc || payload.billing || payload.BillingDocument || '').trim();

        const workflowInstanceId = String(

            payload.workflowInstanceId || payload.workflowId || payload.WorkflowInstanceId || ''

        ).trim();

        const nowIso = new Date().toISOString();

        const isRequestLikeCode = (value) => /^(REQ|QTREQ|REQUEST)[0-9A-Z_-]*$/i.test(String(value || '').trim());
        const isUnknownLikeCode = (value) => /^(UNKNOWN|N\/A|NA|NONE|NULL|0{4,})$/i.test(String(value || '').trim());

        const isDocumentLikeCode = (value) => /^[0-9]{6,}$/.test(String(value || '').trim());

        const isBatchLikeCode = (value) => /^[A-Z0-9_-]{20,}$/i.test(String(value || '').trim());



        // Some callbacks return quotationNo as a batch token; treat it as missing to avoid creating duplicate rows.

        let quotationNo = rawQuotationNo;

        if (quotationNo) {

            const sQuoteCode = normalizeLookupCode(quotationNo);

            const sBatchCode = normalizeLookupCode(batchId);

            if (

                (sBatchCode && sQuoteCode === sBatchCode) ||

                (isBatchLikeCode(quotationNo) && !isDocumentLikeCode(quotationNo) && !isRequestLikeCode(quotationNo))

            ) {

                quotationNo = '';

            }

        }



        const hasAnyLookupKey = !!(

            (batchId && batchId !== 'NO_BATCH') ||

            quotationNo ||

            requestId ||

            salesOrder ||

            deliveryDoc

        );



        const hasRealQuotationNo = !!quotationNo && !isRequestLikeCode(quotationNo) && !isUnknownLikeCode(quotationNo);

        const lookupQuotationNo = hasRealQuotationNo

            ? quotationNo

            : (isRequestLikeCode(quotationNo) ? quotationNo : requestId);



        if (!hasAnyLookupKey) {

            console.warn('[Webhook] Ignored quotation progress payload due to missing lookup keys');

            return {

                ID: 'IGNORED',

                statusCode: 'IGNORED',

                statusText: 'Ignored',

                currentStage: 'Ignored',

                updatedAt: nowIso,

                message: 'Webhook ignored due to missing batchId/quotationNo/salesOrder/deliveryDoc.'

            };

        }



        const resolved = resolveWarehouseTracking(payload);
        const isFailedQuotation = ['ERROR', 'FAILED', 'REJECTED'].includes(String(resolved.statusCode || '').toUpperCase());



        let recordId = '';

        if (batchId && lookupQuotationNo) {

            recordId = buildProcessingRecordId(batchId, lookupQuotationNo);

        }



        let existing = null;

        if (recordId) {

            existing = await withDbAcquireRetry(

                () => SELECT.one.from(ProcessingQuotations).where({ ID: recordId }),

                { retries: 2, baseDelayMs: 150 }

            );

        }



        if (!existing && salesOrder) {

            existing = await withDbAcquireRetry(

                () => SELECT.one.from(ProcessingQuotations).where({ salesOrder }),

                { retries: 2, baseDelayMs: 150 }

            );

        }



        if (!existing && batchId) {
            // Search by batchId first (without requiring quotationNo match)
            // This handles the case where initial upload has empty quotationNo
            existing = await withDbAcquireRetry(
                () => SELECT.one.from(ProcessingQuotations).where({ batchId }),
                { retries: 2, baseDelayMs: 150 }
            );
        }

        if (!existing && quotationNo) {
            // If not found by batchId, search by quotationNo
            existing = await withDbAcquireRetry(
                () => SELECT.one.from(ProcessingQuotations).where({ quotationNo }),
                { retries: 2, baseDelayMs: 150 }
            );
        }



        if (!existing && requestId && requestId !== quotationNo) {

            if (batchId) {

                existing = await withDbAcquireRetry(

                    () => SELECT.one.from(ProcessingQuotations).where({ batchId, quotationNo: requestId }),

                    { retries: 2, baseDelayMs: 150 }

                );

            }



            if (!existing) {

                existing = await withDbAcquireRetry(

                    () => SELECT.one.from(ProcessingQuotations).where({ quotationNo: requestId }),

                    { retries: 2, baseDelayMs: 150 }

                );

            }

        }



        if (!existing && deliveryDoc) {

            existing = await withDbAcquireRetry(

                () => SELECT.one.from(ProcessingQuotations).where({ delivery: deliveryDoc }),

                { retries: 2, baseDelayMs: 150 }

            );

        }



        if (!existing && batchId) {

            const byBatchRows = await withDbAcquireRetry(

                () => SELECT.from(ProcessingQuotations)

                    .columns('ID', 'batchId', 'quotationNo', 'salesOrder', 'statusCode', 'delivery', 'billing', 'updatedAt', 'currentStage')

                    .where({ batchId }),

                { retries: 1, baseDelayMs: 150 }

            );

            const batchCode = normalizeLookupCode(batchId);

            const quotationCode = normalizeLookupCode(quotationNo);

            const requestCode = normalizeLookupCode(requestId);

            const quoteLooksLikeDoc = isDocumentLikeCode(quotationCode);

            const hasStrictQuotationTarget = !!quotationCode && !isRequestLikeCode(quotationCode);

            const hasRequestLikeTarget = !!quotationCode && isRequestLikeCode(quotationCode);

            let best = null;



            for (const row of (byBatchRows || [])) {

                let score = 0;

                const rowBatchCode = normalizeLookupCode(row && row.batchId);

                const rowQuotationCode = normalizeLookupCode(row && row.quotationNo);

                const rowSalesCode = normalizeLookupCode(row && row.salesOrder);

                const rowStage = String(row && row.currentStage || '').toUpperCase();

                const quotationMatched = !!quotationCode && (rowQuotationCode === quotationCode || rowSalesCode === quotationCode);

                const requestMatched = !!(requestCode && requestCode !== batchCode && rowQuotationCode === requestCode);

                const placeholderBridgeMatch = !!(quoteLooksLikeDoc && isRequestLikeCode(rowQuotationCode));



                if (rowBatchCode === batchCode) {

                    score += 5;

                }



                if (quotationCode) {

                    if (rowQuotationCode === quotationCode) {

                        score += 8;

                    }

                    if (rowSalesCode === quotationCode) {

                        score += 6;

                    }

                    if (quoteLooksLikeDoc && isRequestLikeCode(rowQuotationCode)) {

                        score += 5;

                    }

                }



                if (requestMatched) {

                    score += 7;

                }



                // Request-like callbacks (REQxxx) should only map to the same request placeholder.

                if (hasRequestLikeTarget && !quotationMatched && !requestMatched) {

                    continue;

                }



                // Prevent explicit quotation callbacks from being merged into another quotation

                // in the same batch unless we have a concrete quotation/request/placeholder bridge.

                if (hasStrictQuotationTarget && !quotationMatched && !requestMatched && !placeholderBridgeMatch) {

                    continue;

                }



                const rowStatus = String(row && row.statusCode || '').toUpperCase();

                if (rowStatus === 'RUNNING' || rowStatus === 'PENDING') {

                    score += 3;

                }



                const hasNoFinalDocs = !String(row && row.delivery || '').trim() && !String(row && row.billing || '').trim();

                if (hasNoFinalDocs) {

                    score += 1;

                }



                if (rowStage.indexOf('MAIN DISPATCHER') !== -1) {

                    score += 2;

                }



                if (!String(row && row.salesOrder || '').trim()) {

                    score += 1;

                }



                if (!best || score > best.score || (score === best.score && String(row && row.updatedAt || '') < String(best.row && best.row.updatedAt || ''))) {

                    best = { score, row };

                }

            }



            if (best && best.row) {

                existing = await withDbAcquireRetry(

                    () => SELECT.one.from(ProcessingQuotations).where({ ID: best.row.ID }),

                    { retries: 1, baseDelayMs: 150 }

                );

            }

        }



        if (!existing && quotationNo) {

            const openRows = await withDbAcquireRetry(

                () => SELECT.from(ProcessingQuotations)

                    .columns('ID', 'batchId', 'quotationNo', 'salesOrder', 'statusCode', 'delivery', 'billing', 'updatedAt', 'currentStage', 'processType')

                    .where({ processType: 'SD_OTC' })

                    .orderBy('updatedAt asc')

                    .limit(60),

                { retries: 1, baseDelayMs: 150 }

            );



            const batchCode = normalizeLookupCode(batchId);

            const quotationCode = normalizeLookupCode(quotationNo);

            const requestCode = normalizeLookupCode(requestId);

            const quoteLooksLikeDoc = isDocumentLikeCode(quotationCode);

            const hasStrictQuotationTarget = !!quotationCode && !isRequestLikeCode(quotationCode);

            const hasRequestLikeTarget = !!quotationCode && isRequestLikeCode(quotationCode);

            let best = null;



            for (const row of (openRows || [])) {

                if (!row || !row.ID) {

                    continue;

                }



                const rowStatus = String(row.statusCode || '').toUpperCase();

                if (rowStatus !== 'RUNNING' && rowStatus !== 'PENDING') {

                    continue;

                }



                if (String(row.delivery || '').trim() || String(row.billing || '').trim()) {

                    continue;

                }



                let score = 0;

                const rowBatchCode = normalizeLookupCode(row.batchId);

                const rowQuotationCode = normalizeLookupCode(row.quotationNo);

                const rowSalesCode = normalizeLookupCode(row.salesOrder);

                const rowStage = String(row.currentStage || '').toUpperCase();

                const quotationMatched = !!quotationCode && (rowQuotationCode === quotationCode || rowSalesCode === quotationCode);

                const requestMatched = !!(requestCode && requestCode !== batchCode && rowQuotationCode === requestCode);

                const placeholderBridgeMatch = !!(quoteLooksLikeDoc && isRequestLikeCode(rowQuotationCode));



                if (batchCode && rowBatchCode && rowBatchCode !== batchCode) {

                    continue;

                }



                if (batchCode && rowBatchCode === batchCode) {

                    score += 10;

                }



                if (quotationCode) {

                    if (rowQuotationCode === quotationCode) {

                        score += 8;

                    }

                    if (rowSalesCode === quotationCode) {

                        score += 6;

                    }

                    if (quoteLooksLikeDoc && isRequestLikeCode(rowQuotationCode)) {

                        score += 5;

                    }

                }



                if (requestMatched) {

                    score += 8;

                }



                // Request-like callbacks (REQxxx) must stay mapped to the same request key.

                if (hasRequestLikeTarget && !quotationMatched && !requestMatched) {

                    continue;

                }



                // For explicit quotation callbacks, avoid picking unrelated running rows.

                if (hasStrictQuotationTarget && !quotationMatched && !requestMatched && !placeholderBridgeMatch) {

                    continue;

                }



                if (rowStage.indexOf('MAIN DISPATCHER') !== -1) {

                    score += 3;

                }



                if (!String(row.salesOrder || '').trim()) {

                    score += 2;

                }



                if (!best || score > best.score || (score === best.score && String(row.updatedAt || '') < String(best.row && best.row.updatedAt || ''))) {

                    best = { score, row };

                }

            }



            if (best && best.row && best.score > 0) {

                existing = await withDbAcquireRetry(

                    () => SELECT.one.from(ProcessingQuotations).where({ ID: best.row.ID }),

                    { retries: 1, baseDelayMs: 150 }

                );

            }

        }



        if (existing && hasRealQuotationNo) {

            const incomingQuotationCode = normalizeLookupCode(quotationNo);

            const existingQuotationCode = normalizeLookupCode(existing.quotationNo);

            const existingSalesCode = normalizeLookupCode(existing.salesOrder);

            const requestCode = normalizeLookupCode(requestId);

            const batchCode = normalizeLookupCode(batchId);

            const existingIsPlaceholder = isRequestLikeCode(existing && existing.quotationNo);



            const matchesIncomingQuotation =

                (existingQuotationCode && existingQuotationCode === incomingQuotationCode) ||

                (existingSalesCode && existingSalesCode === incomingQuotationCode);



            const matchesIncomingRequest = !!(

                requestCode &&

                requestCode !== batchCode &&

                (existingQuotationCode === requestCode || existingSalesCode === requestCode)

            );



            // If we matched a different real quotation row by weak heuristics, do not overwrite it.

            if (!matchesIncomingQuotation && !matchesIncomingRequest && !existingIsPlaceholder) {

                existing = null;

                recordId = '';

            }

        }



        if (existing && existing.ID) {

            recordId = existing.ID;

        }



        if (!recordId) {

            recordId = buildProcessingRecordId(batchId || workflowInstanceId || randomUUID(), lookupQuotationNo || salesOrder || deliveryDoc);

        }



        const existingItems = parseExistingItemsContainer(existing && existing.itemsJson);

        const incomingQuotationDetail = extractWarehouseDetailFromPayload(payload);

        const mergedBusinessItems = mergeQuotationLineRows(existingItems.items, incomingQuotationDetail.items || []);

        const mergedTotalQuantity = sumQuotationItemQuantity(mergedBusinessItems);

        const mergedTotalItems = Math.max(

            toNumberOr(existing && existing.totalItems, 0),

            mergedBusinessItems.length

        );

        const persistedQuotationNo = hasRealQuotationNo
            ? quotationNo
            : (isFailedQuotation ? 'UNKNOWN' : (quotationNo || (existing && existing.quotationNo) || requestId || 'UNKNOWN'));

        const persistedCustomerId = isFailedQuotation ? 'Unknown' : String(
            payload.soldTo
            || payload.customerId
            || (incomingQuotationDetail && incomingQuotationDetail.customerId)
            || (existing && existing.customerId)
            || ''
        ).trim();

        const persistedCustomerName = isFailedQuotation ? 'Unknown' : String(
            payload.soldToName
            || payload.customerName
            || (incomingQuotationDetail && incomingQuotationDetail.customerName)
            || (existing && existing.customerName)
            || ''
        ).trim();



        const mergedQuotationDetail = mergeQuotationDetailMeta(

            existingItems.quotationDetail,

            incomingQuotationDetail,

            {

                requestId: requestId || '',

                quotationNo: persistedQuotationNo,

                salesOrder: salesOrder || (existing && existing.salesOrder) || '',

                customerId: persistedCustomerId,

                customerName: persistedCustomerName,

                docType: firstNonEmpty(payload.docType, payload.DocType),

                salesOrg: firstNonEmpty(payload.salesOrg, payload.SalesOrg),

                distrChan: firstNonEmpty(payload.distrChan, payload.DistrChan),

                division: firstNonEmpty(payload.division, payload.Division),

                shipTo: firstNonEmpty(payload.shipTo, payload.ShipTo),

                poNumber: firstNonEmpty(payload.poNumber, payload.poNo, payload.PoNumber, payload.PONumber),

                reqDateH: firstNonEmpty(payload.reqDateH, payload.ReqDateH, payload.reqDate, payload.ReqDate),

                message: resolved.message,

                payload: stringifyPayloadSafe(payload.payload || payload.responsePayload || payload.rawPayload || ''),

                callbackStep: firstNonEmpty(payload.callbackStep, payload.currentStage, payload.stage),

                callbackStatus: firstNonEmpty(payload.callbackStatus, payload.status, payload.Status),

                workflowInstanceId: firstNonEmpty(payload.workflowInstanceId, payload.workflowId, payload.WorkflowInstanceId),

                deliveryStatus: firstNonEmpty(payload.deliveryStatus, payload.DeliveryStatus, payload.status, payload.Status),

                pickingStatus: firstNonEmpty(payload.pickingStatus, payload.PickingStatus, payload.pickStatus, payload.PickStatus),

                pickingDate: firstNonEmpty(payload.pickingDate, payload.PickingDate, payload.pickDate, payload.PickDate),

                pickingBy: firstNonEmpty(payload.pickingBy, payload.PickingBy, payload.pickBy, payload.PickBy),

                pgiStatus: firstNonEmpty(payload.pgiStatus, payload.PGIStatus, payload.postGoodsIssueStatus, payload.PostGoodsIssueStatus),

                pgiDate: firstNonEmpty(payload.pgiDate, payload.PGIDate, payload.postGoodsIssueDate, payload.PostGoodsIssueDate),

                pgiBy: firstNonEmpty(payload.pgiBy, payload.PGIBy, payload.postGoodsIssueBy, payload.PostGoodsIssueBy),

                itemCount: mergedTotalItems

            }

        );



        const mergedItemsJson = {

            items: mergedBusinessItems,

            prs: existingItems.prs,

            pos: existingItems.pos,

            poCount: existingItems.poCount,

            expectedPoCount: existingItems.expectedPoCount,

            quotationDetail: mergedQuotationDetail

        };



        const upsertPayload = {

            ID: recordId,

            batchId: batchId || (existing && existing.batchId) || '',

            quotationNo: persistedQuotationNo,

            customerId: persistedCustomerId || String(mergedQuotationDetail.customerId || '').trim(),

            customerName: persistedCustomerName || String(mergedQuotationDetail.customerName || '').trim(),

            processType: (existing && existing.processType) || 'SD_OTC',

            uploadMethod: (existing && existing.uploadMethod) || '',

            uploadType: firstNonEmpty(payload.uploadType, payload.fileType, (existing && existing.uploadType)),

            currentStage: resolved.currentStage,

            statusCode: resolved.statusCode,

            statusText: resolved.statusText,

            salesOrder: salesOrder || (existing && existing.salesOrder) || '',

            delivery: deliveryDoc || (existing && existing.delivery) || '',

            billing: billingDoc || (existing && existing.billing) || '',

            message: resolved.message || '',

            totalItems: mergedTotalItems,

            totalQuantity: mergedTotalQuantity > 0 ? mergedTotalQuantity : toNumberOr((existing && existing.totalQuantity) || 0, 0),

            itemsJson: JSON.stringify(mergedItemsJson),

            uploadAt: (existing && existing.uploadAt) || (existing && existing.createdAt) || nowIso,

            completedAt: (existing && existing.completedAt) || (['SUCCESS', 'ERROR', 'FAILED', 'REJECTED'].includes(resolved.statusCode) ? nowIso : null),

            createdAt: (existing && existing.createdAt) || nowIso,

            updatedAt: nowIso,

            createdBy: firstNonEmpty(payload.requesterEmail, payload.RequesterEmail, payload.createdBy, payload.CreatedBy, (existing && existing.createdBy), 'cpi-callback')

        };



        if (existing) {

            await withDbAcquireRetry(

                () => UPDATE(ProcessingQuotations)

                    .set(upsertPayload)

                    .where({ ID: recordId }),

                { retries: 2, baseDelayMs: 180 }

            );

        } else {

            await withDbAcquireRetry(

                () => INSERT.into(ProcessingQuotations).entries(upsertPayload),

                { retries: 2, baseDelayMs: 180 }

            );

        }



        return {

            ID: recordId,

            statusCode: resolved.statusCode,

            statusText: resolved.statusText,

            currentStage: resolved.currentStage,

            updatedAt: nowIso,

            message: upsertPayload.message

        };

    };



    const handleProcurementProgress = async (payloadInput) => {

        const payload = payloadInput || {};

        const nowIso = new Date().toISOString();



        const explicitBatchId = String(payload.batchId || '').trim();

        const quotationNo = String(payload.quotationNo || '').trim();

        const explicitSalesOrder = String(payload.salesOrder || '').trim();

        const directPoNumber = String(payload.poNumber || '').trim();

        const directPoItem = String(payload.poItem || '').trim();

        const directPreqNo = String(payload.preqNo || '').trim();

        const directPreqItem = String(payload.preqItem || '').trim();

        const explicitStatus = String(payload.status || payload.callbackStatus || '').trim();

        const explicitMessage = String(payload.message || '').trim();

        const expectedPoCountInput = toNumberOr(payload.expectedPoCount, 0);

        const parsedBatchId = extractBatchIdFromAny(payload.payload || payload.responsePayload || payload.rawPayload || payload);

        const batchId = firstNonEmpty(explicitBatchId, parsedBatchId);



        if (!batchId || batchId === 'NO_BATCH') {

            console.warn('[Webhook] Ignored procurement payload due to missing batchId: ' + quotationNo);

            return {

                ID: 'IGNORED',

                statusCode: 'IGNORED',

                statusText: 'Ignored',

                currentStage: 'Ignored',

                updatedAt: nowIso,

                message: 'Webhook ignored to prevent NO_BATCH errors.'

            };

        }



        const parsed = parseProcurementProgressPayload(payload.payload || payload.responsePayload || payload.rawPayload || payload);

        if (directPoNumber || directPreqNo) {

            const directEntry = normalizePoProgressEntry({

                PoNumber: directPoNumber,

                PoItem: directPoItem,

                PreqNo: directPreqNo,

                PreqItem: directPreqItem,

                SalesOrder: explicitSalesOrder,

                Status: explicitStatus,

                Message: explicitMessage

            }, {});

            pushParsedProcurementEntry(parsed, directEntry);

        }



        const incomingLists = normalizeProcurementLists(parsed.prs, parsed.pos);

        parsed.prs = incomingLists.prs;

        parsed.pos = incomingLists.pos;



        const salesOrder = firstNonEmpty(explicitSalesOrder, parsed.salesOrder);

        const incomingPreqSet = new Set();

        const pushIncomingPreq = (value) => {

            const code = normalizeLookupCode(value);

            if (code) {

                incomingPreqSet.add(code);

            }

        };



        pushIncomingPreq(directPreqNo);

        for (const procItem of ([]).concat(parsed.prs || [], parsed.pos || [])) {

            pushIncomingPreq(procItem && procItem.preqNo);

        }



        let recordId = '';

        if (batchId || quotationNo) {

            recordId = buildProcessingRecordId(batchId, quotationNo || salesOrder || 'PROCUREMENT');

        }



        let existing = null;

        if (recordId) {

            existing = await SELECT.one.from(ProcessingQuotations).where({ ID: recordId });

        }



        if (!existing && salesOrder) {

            existing = await SELECT.one.from(ProcessingQuotations).where({ salesOrder });

        }



        if (!existing && quotationNo) {

            existing = await SELECT.one.from(ProcessingQuotations).where({ quotationNo });

        }



        if (!existing && incomingPreqSet.size > 0) {

            const allProcRows = await SELECT.from(ProcessingQuotations).where({ processType: 'SO_PROCUREMENT' });

            const hasStatus = (code, expected) => String(code || '').toUpperCase() === expected;

            let best = null;



            for (const row of (allProcRows || [])) {

                const rowItems = parseExistingItemsContainer(row && row.itemsJson);

                const rowCodes = parseProcurementCodesFromContainer(rowItems);

                let overlap = 0;



                for (const code of incomingPreqSet) {

                    if (rowCodes.preqSet.has(code)) {

                        overlap += 1;

                    }

                }



                if (overlap <= 0) {

                    continue;

                }



                let score = overlap * 10;

                if (batchId && normalizeLookupCode(row.batchId) === normalizeLookupCode(batchId)) {

                    score += 6;

                }

                if (salesOrder && normalizeLookupCode(row.salesOrder) === normalizeLookupCode(salesOrder)) {

                    score += 6;

                }

                if (hasStatus(row.statusCode, 'RUNNING') || hasStatus(row.statusCode, 'PENDING')) {

                    score += 3;

                }



                if (!best || score > best.score || (score === best.score && String(row.updatedAt || '') > String(best.row.updatedAt || ''))) {

                    best = { score, row };

                }

            }



            if (best && best.row) {

                existing = best.row;

            }

        }



        if (!existing && !quotationNo && !salesOrder && incomingPreqSet.size > 0) {

            const activeProcRows = await SELECT.from(ProcessingQuotations).where({ processType: 'SO_PROCUREMENT' });

            const openRows = (activeProcRows || []).filter((row) => {

                const code = String(row && row.statusCode || '').toUpperCase();

                return code === 'RUNNING' || code === 'PENDING';

            });



            if (openRows.length === 1) {

                existing = openRows[0];

            }

        }



        if (existing && existing.ID) {

            recordId = existing.ID;

        }



        if (!recordId) {

            const safeQuotation = firstNonEmpty(quotationNo, existing && existing.quotationNo);

            const safeSalesOrder = firstNonEmpty(salesOrder, existing && existing.salesOrder);

            if (!safeQuotation && !safeSalesOrder && incomingPreqSet.size > 0) {

                return {

                    ID: '',

                    statusCode: 'IGNORED',

                    statusText: 'Bỏ qua callback PO',

                    currentStage: 'IF_Worker_Create_PO_From_PR_After_Approval: Unmatched',

                    updatedAt: nowIso,

                    message: 'Khong tim thay ban ghi Procurement de map callback theo PR/PO. Vui long gui them quotationNo hoac salesOrder.'

                };

            }



            recordId = buildProcessingRecordId(batchId || randomUUID(), safeQuotation || safeSalesOrder || 'PROCUREMENT');

        }



        const existingItems = parseExistingItemsContainer(existing && existing.itemsJson);

        const existingLists = normalizeProcurementLists(existingItems.prs, existingItems.pos);

        const mergedPrs = mergePoProgressLists(existingLists.prs, parsed.prs);

        const mergedPos = mergePoProgressLists(existingLists.pos, parsed.pos);

        const completedPoCount = countUniquePoDocs(mergedPos) || toNumberOr(existingItems.poCount, 0);

        const existingCodes = parseProcurementCodesFromContainer(existingItems);

        const callbackStep = firstNonEmpty(payload.callbackStep, payload.currentStage, payload.stage, payload.step);



        let expectedPoCount = expectedPoCountInput || parsed.expectedPoCount || existingItems.expectedPoCount;

        if (!expectedPoCount && mergedPrs.length > 0) {

            expectedPoCount = mergedPrs.length;

        }

        if (!expectedPoCount && existingCodes.prCount > 0) {

            expectedPoCount = existingCodes.prCount;

        }



        const resolved = resolveProcurementTracking({

            explicitStatus,

            parsedStatus: parsed.statusHint,

            completedPoCount,

            expectedPoCount,

            hasAnyPos: mergedPos.length > 0,

            hasAnyPr: mergedPrs.length > 0,

            callbackStep

        });



        const progressText = mergedPos.length > 0

            ? (expectedPoCount > 0

                ? `PO progress ${completedPoCount}/${expectedPoCount}`

                : `PO progress ${completedPoCount}`)

            : (mergedPrs.length > 0

                ? `PR count ${mergedPrs.length}`

                : '');



        const baseMessage = sanitizeCallbackMessage(firstNonEmpty(explicitMessage, parsed.message));



        const resolvedMessage = clipText([

            baseMessage,

            progressText

        ].filter(Boolean).join(' | '), 600);



        const mergedItemsJson = {

            items: existingItems.items,

            prs: mergedPrs,

            pos: mergedPos,

            poCount: completedPoCount,

            expectedPoCount,

            quotationDetail: existingItems.quotationDetail || {}

        };



        const upsertPayload = {

            ID: recordId,

            batchId: batchId || (existing && existing.batchId) || '',

            quotationNo: quotationNo || (existing && existing.quotationNo) || (salesOrder || (existing && existing.salesOrder) || ''),

            customerId: (existing && existing.customerId) || '',

            customerName: (existing && existing.customerName) || '',

            processType: 'SO_PROCUREMENT',

            uploadMethod: (existing && existing.uploadMethod) || '',

            uploadType: payload.uploadType || payload.fileType || (existing && existing.uploadType) || '',

            currentStage: resolved.currentStage,

            statusCode: resolved.statusCode,

            statusText: resolved.statusText,

            salesOrder: salesOrder || (existing && existing.salesOrder) || '',

            delivery: (existing && existing.delivery) || '',

            billing: (existing && existing.billing) || '',

            message: resolvedMessage,

            totalItems: (existing && existing.totalItems) || existingItems.items.length || 0,

            totalQuantity: (existing && existing.totalQuantity) || 0,

            itemsJson: JSON.stringify(mergedItemsJson),

            uploadAt: (existing && existing.uploadAt) || (existing && existing.createdAt) || nowIso,

            completedAt: (existing && existing.completedAt) || (['SUCCESS', 'ERROR', 'FAILED', 'REJECTED'].includes(resolved.statusCode) ? nowIso : null),

            createdAt: (existing && existing.createdAt) || nowIso,

            updatedAt: nowIso,

            createdBy: firstNonEmpty(payload.requesterEmail, payload.RequesterEmail, payload.createdBy, payload.CreatedBy, (existing && existing.createdBy), 'cpi-callback')

        };



        if (existing) {

            await UPDATE(ProcessingQuotations)

                .set(upsertPayload)

                .where({ ID: recordId });

        } else {

            await INSERT.into(ProcessingQuotations).entries(upsertPayload);

        }



        return {

            ID: recordId,

            statusCode: resolved.statusCode,

            statusText: resolved.statusText,

            currentStage: resolved.currentStage,

            updatedAt: nowIso,

            message: resolvedMessage

        };

    };



    this.on('upsertQuotationProgress', async (req) => {

        const rawPayload = req.data || {};

        const nestedPayload = parseNestedPayloadObject(rawPayload);

        const mergedPayload = nestedPayload && typeof nestedPayload === 'object'

            ? Object.assign({}, nestedPayload, rawPayload)

            : rawPayload;



        const callbackSource = normalizeCallbackSource(mergedPayload);

        const batchItems = extractBatchQuotationItems(mergedPayload);



        if (shouldUseProcurementCallback(mergedPayload, callbackSource)) {

            const normalizedProcurement = normalizeToProcurementCallbackPayload(mergedPayload, callbackSource);

            return handleProcurementProgress(normalizedProcurement);

        }



        if (batchItems.length > 0) {

            let successCount = 0;

            let runningCount = 0;

            let errorCount = 0;

            let ignoredCount = 0;

            let lastResult = null;



            for (const item of batchItems) {

                const mergedItemPayload = Object.assign({}, mergedPayload, item || {});

                const normalizedItem = normalizeToWarehouseCallbackPayload(mergedItemPayload, callbackSource);

                const itemResult = await handleWarehouseProgress(normalizedItem);

                lastResult = itemResult;



                const code = String(itemResult && itemResult.statusCode || '').toUpperCase();

                if (code === 'SUCCESS') {

                    successCount += 1;

                } else if (code === 'RUNNING' || code === 'PENDING') {

                    runningCount += 1;

                } else if (code === 'IGNORED') {

                    ignoredCount += 1;

                } else {

                    errorCount += 1;

                }

            }



            const total = batchItems.length;

            const nowIso = new Date().toISOString();

            let aggregateCode = 'SUCCESS';

            let aggregateText = 'Hoàn tất';



            if (errorCount > 0 && successCount === 0 && runningCount === 0) {

                aggregateCode = 'ERROR';

                aggregateText = 'Thất bại';

            } else if (errorCount > 0) {

                aggregateCode = 'PARTIAL';

                aggregateText = 'Một phần';

            } else if (runningCount > 0) {

                aggregateCode = 'RUNNING';

                aggregateText = 'Đang xử lý';

            } else if (ignoredCount > 0 && successCount === 0 && runningCount === 0) {

                aggregateCode = 'IGNORED';

                aggregateText = 'Bỏ qua';

            }



            const summaryMessage = [

                `Batch callback processed ${total} item(s)`,

                `${successCount} success`,

                `${runningCount} running`,

                `${errorCount} error`,

                `${ignoredCount} ignored`

            ].join(', ');



            return {

                ID: (lastResult && lastResult.ID) || `BATCH_${firstNonEmpty(mergedPayload.batchId, mergedPayload.BatchId, mergedPayload.batchID, 'NO_BATCH')}`,

                statusCode: aggregateCode,

                statusText: aggregateText,

                currentStage: firstNonEmpty(mergedPayload.callbackStep, mergedPayload.currentStage, mergedPayload.stage, 'Quotation Callback: Batch Processed'),

                updatedAt: nowIso,

                message: summaryMessage

            };

        }



        const normalizedO2c = normalizeToWarehouseCallbackPayload(mergedPayload, callbackSource);

        return handleWarehouseProgress(normalizedO2c);

    });



    this.on('upsertWarehouseProgress', async (req) => {

        return handleWarehouseProgress(req.data || {});

    });



    this.on('upsertProcurementProgress', async (req) => {

        return handleProcurementProgress(req.data || {});

    });



    /**

     * Action: createSDWithDelivery

     * Description: Creates Sales Order and Delivery (no Billing) via CPI

     */

    this.on('createSDWithDelivery', async (req) => {

        const { orderId, customer, salesOrg, items } = req.data;



        console.log(`[CAP] Processing SD+Delivery for Order: ${orderId}`);



        try {

            // Map to CPI sales-order payload

            const cpiPayload = {

                DocType: "OR1",

                PO: orderId || "",

                SalesOrg: salesOrg || "FU24",

                Channel: "FU",

                SalesDistrict: "",

                Division: "FH",

                Incoterms1: "FOB",

                Incoterms2: "Miami",

                PaymentTerms: "0001",

                SoldToParty: customer || "1003209",

                ShipToParty: customer || "1003209",

                BillToParty: customer || "1003209",

                Payer: customer || "1003209",

                Material: items?.[0]?.material || "HEADPHONE_LG",

                Quantity: items?.[0]?.quantity || 10,

                Plant: items?.[0]?.plant || "FU24",

                StorageLoc: "TG01",

                PriceDate: formatDateOnly(),

                TestRun: "",

                ReqDate: formatDateOnly(),

                ReqTime: "12:30:00"

            };



            // Call CPI Sales Order endpoint (which creates SO + Delivery)

            const cpiResponse = await callCPI(CPI_CONFIG.endpoints.salesOrder, cpiPayload);



            // Parse CPI response (expected: { SalesOrder: "...", DeliveryDocument: "..." })

            const salesOrderNum = cpiResponse.SalesOrder || cpiResponse.salesOrder || "N/A";

            const deliveryNum = cpiResponse.DeliveryDocument || cpiResponse.delivery || "N/A";



            // Update Order status in DB

            await UPDATE(Orders, orderId)

                .set({

                    status: 'DELIVERED',

                    notes: `SO: ${salesOrderNum}, Delivery: ${deliveryNum}`

                });



            console.log(`[CAP] SD+Delivery completed for ${orderId}: SO=${salesOrderNum}, Delivery=${deliveryNum}`);



            return {

                salesOrder: salesOrderNum,

                delivery: deliveryNum,

                status: 'SUCCESS',

                message: `Sales Order ${salesOrderNum} and Delivery ${deliveryNum} created successfully`

            };



        } catch (error) {

            console.error(`[CAP] SD+Delivery failed for ${orderId}:`, error.message);



            // Update Order with error

            await UPDATE(Orders, orderId)

                .set({

                    status: 'ERROR',

                    notes: `CPI Error: ${error.message}`

                });



            throw error;

        }

    });



    /**

     * Action: createSDFullChain

     * Description: Creates Sales Order, Delivery, and Billing via CPI (full chain)

     */

    this.on('createSDFullChain', async (req) => {

        const { orderId, customer, salesOrg, items } = req.data;



        console.log(`[CAP] Processing SD Full Chain for Order: ${orderId}`);



        try {

            // Map to CPI sales-order payload

            const cpiPayload = {

                DocType: "OR1",

                PO: orderId || "",

                SalesOrg: salesOrg || "FU24",

                Channel: "FU",

                SalesDistrict: "",

                Division: "FH",

                Incoterms1: "FOB",

                Incoterms2: "Miami",

                PaymentTerms: "0001",

                SoldToParty: customer || "1003209",

                ShipToParty: customer || "1003209",

                BillToParty: customer || "1003209",

                Payer: customer || "1003209",

                Material: items?.[0]?.material || "HEADPHONE_LG",

                Quantity: items?.[0]?.quantity || 10,

                Plant: items?.[0]?.plant || "FU24",

                StorageLoc: "TG01",

                PriceDate: formatDateOnly(),

                TestRun: "",

                ReqDate: formatDateOnly(),

                ReqTime: "12:30:00"

            };



            // Call CPI SD Full Chain endpoint (SO + Delivery + Billing)

            const cpiResponse = await callCPI(CPI_CONFIG.endpoints.sdFullChain, cpiPayload);



            const salesOrderNum = cpiResponse.SalesOrder || cpiResponse.salesOrder || "N/A";

            const deliveryNum = cpiResponse.DeliveryDocument || cpiResponse.delivery || "N/A";

            const billingNum = cpiResponse.BillingDocument || cpiResponse.billing || "N/A";



            // Update Order status in DB

            await UPDATE(Orders, orderId)

                .set({

                    status: 'COMPLETED',

                    notes: `SO: ${salesOrderNum}, Delivery: ${deliveryNum}, Billing: ${billingNum}`

                });



            console.log(`[CAP] SD Full Chain completed: SO=${salesOrderNum}, Delivery=${deliveryNum}, Billing=${billingNum}`);



            return {

                salesOrder: salesOrderNum,

                delivery: deliveryNum,

                billing: billingNum,

                status: 'SUCCESS',

                message: 'SD Full Chain completed successfully'

            };



        } catch (error) {

            console.error(`[CAP] SD Full Chain failed for ${orderId}:`, error.message);



            await UPDATE(Orders, orderId)

                .set({

                    status: 'ERROR',

                    notes: `CPI Error: ${error.message}`

                });



            throw error;

        }

    });



    /**

     * Action: createMMFullChain

     * Description: Call CPI to create Sales Order → PR → PO chain

     */

    this.on('createMMFullChain', async (req) => {

        const { orderId, prType, items } = req.data;



        console.log(`[MM Full Chain] Processing Order: ${orderId}`);



        try {

            // Call CPI MM Full Chain endpoint

            const cpiResponse = await callCPI(CPI_CONFIG.endpoints.mmFullChain, {

                prType: prType || 'NB',

                items: items.map(item => ({

                    material: item.material,

                    quantity: item.quantity,

                    unit: item.unit || 'EA',

                    plant: item.plant || '1000',

                    deliveryDate: item.deliveryDate || formatDateOnly(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),

                    vendor: item.vendor || 'VENDOR-001'

                }))

            });



            // Update Order status

            await UPDATE(Orders, orderId).with({

                status: 'Completed'

            });



            console.log(`[MM Full Chain] Success: SO=${cpiResponse.salesOrder}, PR=${cpiResponse.purchaseRequisition}, PO=${cpiResponse.purchaseOrder}`);



            return {

                salesOrder: cpiResponse.salesOrder,

                purchaseRequisition: cpiResponse.purchaseRequisition,

                purchaseOrder: cpiResponse.purchaseOrder,

                status: 'SUCCESS',

                message: 'MM chain completed successfully'

            };



        } catch (error) {

            console.error('[MM Full Chain] Error:', error.message);



            await UPDATE(Orders, orderId).with({

                status: 'Failed',

                rejectionComment: error.message

            });



            return req.error(500, `MM Chain failed: ${error.message}`);

        }

    });



    /**

     * Action: importFromJSON

     * Description: Receive JSON data and forward to CPI

     */

    this.on('importFromJSON', async (req) => {

        const { data } = req.data;



        try {

            const jsonData = JSON.parse(data);



            // Call CPI JSON Import endpoint

            const cpiResponse = await callCPI(CPI_CONFIG.endpoints.dispatcher, jsonData);



            return {

                ordersCreated: cpiResponse.ordersCreated || 0,

                status: 'SUCCESS'

            };



        } catch (error) {

            console.error('[JSON Import] Error:', error.message);

            return req.error(500, `JSON Import failed: ${error.message}`);

        }

    });

    // ========== TEMPLATE GENERATION ==========
    this.on('READ', 'getTemplate', async (req) => {
        try {
            const flowType = String(req.data?.flowType || 'sales').trim().toLowerCase();

            // Calculate delivery date based on flowType
            const today = new Date();
            let deliveryDate = new Date(today);

            if (flowType === 'procurement') {
                // Procurement: today + 3 months
                deliveryDate.setMonth(deliveryDate.getMonth() + 3);
            } else {
                // Sales: today + 3 days
                deliveryDate.setDate(deliveryDate.getDate() + 3);
            }

            // Format date as YYYY-MM-DD
            const formattedDeliveryDate = formatDateOnly(deliveryDate);

            // CSV Template with Delivery Date
            const csvHeader = 'Quotation No,Customer Code,Material Code,Material Description,Quantity,Unit,Plant,Storage Location,Delivery Date,Unit Price';
            const csvSampleRow = `QT2026001,CUST001,MAT001,Sample Material,10,EA,ND01,TG01,${formattedDeliveryDate},1000000`;
            const csvContent = `${csvHeader}\n${csvSampleRow}\n`;

            // Excel-style CSV with better formatting for both CSV and Excel
            const excelContent = csvContent;

            return {
                content: csvContent,
                fileName: `Quotation_Template_${flowType}_${new Date().getTime()}.csv`,
                fileType: 'CSV',
                status: 'SUCCESS'
            };

        } catch (error) {
            console.error('[Template Generation] Error:', error.message);
            return req.error(500, `Template generation failed: ${error.message}`);
        }
    });

    // Auto-fill Delivery Date in preview/imported data
    const ensureDeliveryDateFilled = (items, flowType) => {
        const today = new Date();
        let defaultDeliveryDate = new Date(today);

        if (flowType === 'procurement') {
            defaultDeliveryDate.setMonth(defaultDeliveryDate.getMonth() + 3);
        } else {
            defaultDeliveryDate.setDate(defaultDeliveryDate.getDate() + 3);
        }

        const formattedDate = formatDateOnly(defaultDeliveryDate);

        return (items || []).map(item => ({
            ...item,
            DeliveryDate: (String(item.DeliveryDate || '').trim() || formattedDate)
        }));
    };

});


