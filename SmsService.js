/**
 * Service for handling SMS-based transaction tracking.
 *
 * This module manages Android-specific SMS permissions and provides logic
 * to scan the device's inbox for bank-related transaction messages.
 *
 * @module SmsService
 */

import { PermissionsAndroid } from 'react-native';
import SmsAndroid from 'react-native-get-sms-android';
import { insertTransaction } from './database';

/**
 * Requests the necessary Android permissions to receive and read SMS messages.
 *
 * @async
 * @returns {Promise<boolean>} True if all permissions are granted, false otherwise.
 */
export const requestSmsPermission = async () => {
  try {
    const granted = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      PermissionsAndroid.PERMISSIONS.READ_SMS,
    ]);
    return (
      granted['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED &&
      granted['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED
    );
  } catch (err) {
    console.warn('Permission Request Error:', err);
    return false;
  }
};

/**
 * Initializes the SMS scanning process.
 */
export const startSmsListener = () => {
  console.log("SMS Listener initialized (Scanning inbox...)");

  const filter = {
    box: 'inbox',
    maxCount: 50, // Increased count to get more history
  };

  SmsAndroid.list(
    JSON.stringify(filter),
    (fail) => {
      console.error('SMS scan failed: ' + fail);
    },
    (count, smsList) => {
      try {
        const messages = JSON.parse(smsList);
        messages.forEach((message) => {
          processMessage(message);
        });
      } catch (e) {
        console.error("Failed to parse SMS list:", e);
      }
    },
  );
};

/**
 * Parses an individual SMS message to detect and log spending transactions.
 */
const processMessage = (message) => {
  const body = message.body.toLowerCase();
  const sender = (message.address || "").toUpperCase();

  // Look for keywords indicating a debit transaction
  const isDebit = body.includes('debited') || body.includes('spent') || body.includes('payment') || body.includes('transferred');

  // Specific check for Credit/Salary as requested
  const isSalary = body.includes('icici bank acc xx219 credited') && body.includes('ncsi');

  if (isDebit || isSalary) {
    // Regex for Amount: Captures numbers after common currency/action keywords
    const amountMatch = body.match(/(?:rs\.?|inr|amt|debited by|credited by)\s*([\d,]+\.?\d*)/i);
    const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

    // Regex for Merchant/VPA: Captures text after "to" or "at"
    const vpaMatch = body.match(/(?:to|at)\s+([a-zA-Z0-9.\-_]+(@[a-zA-Z]+)?)/i);
    let description = vpaMatch ? vpaMatch[1] : "Unknown Spend";

    // Clean up description
    description = description.split(' ')[0].substring(0, 30);

    // Regex for Account: Captures last digits (handles *1234 or XX1234)
    const acctMatch = body.match(/(?:a\/c|account|acc)\s*\*+([0-9]+)|(?:a\/c|account|acc)\s*[xX]+([0-9]+)/i);
    let account_no = (acctMatch ? (acctMatch[1] || acctMatch[2]) : "Unknown");

    // --- Special rule layers ---

    // Rule: JD-ICICIT-S and Credit Card XX9009 -> Rupay, Grocery/Food
    if (sender.includes('JD-ICICIT-S') && body.includes('credit card xx9009 debited')) {
      account_no = "Rupay";
      description = "Grocery/Food";
    }

    // Rule: A/c no. XX7824 -> Axis, Misc
    if (body.includes('a/c no. xx7824')) {
      account_no = "Axis";
      description = "Misc";
    }

    // Rule: ICICI Bank Acc XX219 debited -> ICICI, Loan
    if (body.includes('icici bank acc xx219 debited')) {
      account_no = "ICICI";
      description = "Loan";
    }

    // Rule: ICICI Bank Acc XX219 credited *NCSI* -> Salary
    if (isSalary) {
      account_no = "ICICI";
      description = "Salary";
    }
    // --------------------------

    // Log to local database if a valid amount was found
    if (amount >= 1) {
      const dateTime = new Date(message.date).toISOString();
      const type = isSalary ? 'Automated Income' : 'Automated SMS';
      insertTransaction(type, amount, account_no, description, dateTime)
        .then(() => console.log(`Auto-logged: ${amount} from A/C ${account_no} as ${description}`))
        .catch(err => {
            console.error("Database logging failed:", err);
        });
    }
  }
};
