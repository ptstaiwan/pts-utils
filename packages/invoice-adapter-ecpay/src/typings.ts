import { CustomsMark, InvoiceAllowanceOptions, InvoiceCarrier, InvoiceIssueOptions, InvoicePaymentItem, InvoiceVoidOptions, SpecialTaxCode, TaxType } from '@rytass/invoice';
import { ECPayInvoice } from '.';

export enum ECPayInvoiceAllowanceNotificationTarget {
  SMS = 'SMS',
  EMAIL = 'EMAIL',
}

export interface ECPayInvoiceVoidOptions extends InvoiceVoidOptions {
  reason: string;
}

export interface ECPayInvoiceAllowanceOptions extends InvoiceAllowanceOptions {
  taxType?: Omit<TaxType, TaxType.MIXED | TaxType.SPECIAL>;
  notificationTargets?: ECPayInvoiceAllowanceNotificationTarget[];
  buyerName?: string;
  notifyEmail?: string;
  notifyPhone?: string;
}

export interface ECPayInvoiceVoidRequestBody {
  MerchantID: string;
  InvoiceNo: string;
  InvoiceDate: string;
  Reason: string;
}

export interface ECPayInvoiceInvalidAllowanceRequestBody {
  MerchantID: string;
  InvoiceNo: string;
  AllowanceNo: string;
  Reason: string;
}

export interface ECPayInvoiceAllowanceRequestBody {
  MerchantID: string;
  InvoiceNo: string;
  InvoiceDate: string;
  AllowanceNotify: 'S' | 'E' | 'A' | 'N';
  CustomerName?: string;
  NotifyMail?: string;
  NotifyPhone?: string;
  AllowanceAmount: number;
  Items: {
    ItemSeq: number;
    ItemName: string;
    ItemCount: number;
    ItemWord: string;
    ItemPrice: number;
    ItemTaxType?: '1' | '2' | '3' | '';
    ItemAmount: number;
  }[];
}

export interface ECPayInvoiceVoidResponse {
  PlatformID?: string;
  MerchantID: string;
  RpHeader: {
    Timestamp: number;
  };
  TransCode: number;
  TransMsg: string;
  Data: string;
}

export interface ECPayVoidInvoiceResponseDecrypted {
  RtnCode: number;
  RtnMsg: string;
  InvoiceNo: string;
}

export interface ECPayAllowanceInvoiceResponseDecrypted {
  RtnCode: number;
  RtnMsg: string;
  IA_Allow_No: string;
  IA_Invoice_No: string;
  IA_Date: string;
  IA_Remain_Allowance_Amt: number;
}

export interface ECPayInvalidAllowanceInvoiceResponseDecrypted {
  RtnCode: number;
  RtnMsg: string;
  IA_Invoice_No: string;
}

export interface ECPayInvoiceOptions {
  items: ECPayPaymentItem[];
  issuedOn: Date;
  invoiceNumber: string;
  randomCode: string;
  orderId: string;
  taxType: TaxType;
}

export interface ECPayInvoiceGatewayOptions {
  aesKey?: string;
  aesIv?: string;
  merchantId?: string;
  baseUrl?: string;
}

interface ECPayCustomerInfo {
  id?: string;
  name?: string;
  address?: string;
  mobile?: string;
  email?: string;
}

export interface ECPayPaymentItem extends InvoicePaymentItem {
  name: string;
  unitPrice: number;
  quantity: number;
  unit?: string;
  taxType?: TaxType.TAXED | TaxType.TAX_FREE | TaxType.ZERO_TAX | TaxType.SPECIAL;
  remark?: string;
}

export interface ECPayInvoiceIssueOptions extends InvoiceIssueOptions<ECPayInvoice> {
  items: ECPayPaymentItem[];
  vatNumber?: string;
  carrier?: InvoiceCarrier;
  orderId: string;
  customer: ECPayCustomerInfo;
  customsMark?: CustomsMark;
  remark?: string;
  specialTaxCode?: SpecialTaxCode;
}

export interface ECPayInvoiceResponse {
  PlatformID?: string;
  MerchantID: string;
  RpHeader: {
    Timestamp: number;
  };
  TransCode: number;
  TransMsg: string;
  Data: string;
}

export interface ECPayIssuedInvoiceResponse {
  RtnCode: number;
  RtnMsg: string;
  InvoiceNo: string;
  InvoiceDate: string;
  RandomNumber: string;
}

export interface ECPayInvoiceRequestBody {
  MerchantID: string;
  RelateNumber: string;
  CustomerID: string;
  CustomerIdentifier: string;
  CustomerName: string;
  CustomerAddr: string;
  CustomerPhone: string;
  CustomerEmail: string;
  ClearanceMark: '1' | '2';
  Print: '0' | '1';
  Donation: '0' | '1';
  LoveCode: string;
  CarrierType: '' | '1' | '2' | '3';
  CarrierNum: string;
  TaxType: '1' | '2' | '3' | '4' | '9';
  SpecialTaxType: number;
  SalesAmount: number;
  InvoiceRemark: string;
  Items: {
    ItemSeq: number;
    ItemName: string;
    ItemCount: number;
    ItemWord: string;
    ItemPrice: number;
    ItemTaxType: string;
    ItemAmount: number;
    ItemRemark: string;
  }[];
  InvType: '07' | '08';
  vat: '1';
}

export interface ECPayInvoiceMobileBarcodeValidateResponse {
  RtnCode: number;
  RtnMsg: string;
  IsExist: 'Y' | 'N';
}

export interface ECPayInvoiceLoveCodeValidateResponse {
  RtnCode: number;
  RtnMsg: string;
  IsExist: 'Y' | 'N';
}

export interface ECPayInvoiceMobileBarcodeValidateRequestBody {
  MerchantID: string;
  BarCode: string;
}

export interface ECPayInvoiceLoveCodeValidateRequestBody {
  MerchantID: string;
  LoveCode: string;
}
