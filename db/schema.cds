namespace com.gsp.sap.procurement;

entity Orders {
    key id : String;
    createdBy : String;
    createdAt : String;
    fileName : String;
    totalAmount : String;
    status : String default 'Pending';
    rejectionComment : String;
    items : Composition of many OrderItems on items.parent = $self;
}

entity OrderItems {
    key ID : UUID;
    parent : Association to Orders;
    partNo : String;
    desc : String;
    qty : String;
    price : String;
    total : String;
}

entity UploadHistory {
    key ID          : UUID;
    processType     : String(30);
    uploadMethod    : String(20);
    totalRows       : Integer;
    successRows     : Integer;
    failRows        : Integer;
    salesOrders     : Integer;
    deliveries      : Integer;
    billings        : Integer;
    salesOrderCodes : String(1200);
    deliveryCodes   : String(1200);
    billingCodes    : String(1200);
    statusText      : String(40);
    createdAt       : Timestamp;
    createdBy       : String(100);
}

entity ProcessingQuotations {
    key ID           : String(180);
    batchId          : String(180);
    quotationNo      : String(120);
    customerId       : String(80);
    customerName     : String(160);
    processType      : String(30);
    uploadMethod     : String(20);
    uploadType       : String(20);
    currentStage     : String(140);
    statusCode       : String(20);
    statusText       : String(40);
    salesOrder       : String(80);
    delivery         : String(80);
    billing          : String(80);
    message          : String(600);
    totalItems       : Integer;
    totalQuantity    : Decimal(13, 3);
    itemsJson        : LargeString;
    uploadAt         : Timestamp;
    completedAt      : Timestamp;
    createdAt        : Timestamp;
    updatedAt        : Timestamp;
    createdBy        : String(100);
}

entity StaffUsers {
    key email        : String(255);
    fullName         : String(120);
    role             : String(30) default 'STAFF';
    passwordHash     : String(512);
    isActive         : Boolean default true;
    createdAt        : Timestamp;
    updatedAt        : Timestamp;
}
