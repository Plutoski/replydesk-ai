// Privacy test set: 77 fictional, adversarial customer messages with 120 planted personal details.
// Each secret: [text that must NOT appear in the masked output, severity (H = high, M = medium), label]
// sev: H = card/account/ID/full name/full address/phone/email; M = partial; L = low.
export const CORPUS = [
  // ---------- phones ----------
  { id: "ph-uk-mobile", text: "My number is 07911 123456, please call after 5.", secrets: [["07911 123456", "H", "UK mobile"]] },
  { id: "ph-uk-intl", text: "Call me on +44 7911 123456 or +44 (0)20 7946 0958.", secrets: [["7911 123456", "H", "UK +44 mobile"], ["7946 0958", "H", "UK +44 (0)20 landline"]] },
  { id: "ph-ng", text: "Reach me on +234 803 123 4567 or 0803-123-4567.", secrets: [["803 123 4567", "H", "NG +234"], ["0803-123-4567", "H", "NG local"]] },
  { id: "ph-in", text: "My mobile is +91 98765 43210, landline 080 2345 6789.", secrets: [["98765 43210", "H", "India +91 5-5"], ["2345 6789", "H", "India landline"]] },
  { id: "ph-us-dots", text: "Text 403.555.0198 or 1-800-555-0199 x204 or (587) 555 0123 ext. 12.", secrets: [["403.555.0198", "H", "US dots"], ["800-555-0199", "H", "US 1-800"], ["555 0123", "H", "US parens spaces"]] },
  { id: "ph-us-compact", text: "my cell 4035550198 thanks", secrets: [["4035550198", "H", "US 10 digits no sep"]] },
  { id: "ph-words", text: "call me at five five five, zero one nine eight", secrets: [["five five five, zero one nine eight", "M", "spelled-out phone"]] },
  { id: "ph-short-uk", text: "Office: 020 7946 0958", secrets: [["7946 0958", "H", "UK London landline"]] },

  // ---------- emails ----------
  { id: "em-plus", text: "Use jane.doe+billing@mail.example.co.uk for invoices.", secrets: [["jane.doe", "H", "email + tag local part"], ["example.co.uk", "M", "email domain"]] },
  { id: "em-obf-dot", text: "email is john dot doe at gmail dot com", secrets: [["john dot doe at gmail dot com", "H", "obfuscated email"]] },
  { id: "em-obf-brackets", text: "write to tunde.bakare [at] yahoo [dot] com", secrets: [["tunde.bakare", "H", "[at] email"]] },
  { id: "em-space", text: "my email: amaka.obi @ outlook.com", secrets: [["amaka.obi", "H", "email with spaces"]] },
  { id: "em-name-inside", text: "Order is late. Reply to chukwuemeka.okafor@gmail.com\n\nThanks", secrets: [["chukwuemeka", "H", "email"], ["okafor", "H", "surname in email"]] },
  { id: "em-unicode", text: "contact josé.garcía@correo.es please", secrets: [["garcía@correo.es", "H", "unicode email"]] },

  // ---------- cards ----------
  { id: "cd-dash", text: "Charged twice on 4111-1111-1111-1111 yesterday.", secrets: [["4111-1111-1111-1111", "H", "Visa dashed"], ["1111-1111-1111", "H", "card body"]] },
  { id: "cd-amex", text: "Amex 3782 822463 10005 was declined.", secrets: [["822463", "H", "Amex body"]] },
  { id: "cd-nonluhn", text: "My card 4532 7812 9934 1126 was charged.", secrets: [["4532 7812", "H", "non-Luhn 16-digit card first half"], ["9934", "H", "card middle"]] },
  { id: "cd-nonluhn-compact", text: "card number 4111111111111112 please refund", secrets: [["41111111", "H", "non-Luhn compact card"]] },
  { id: "cd-cvv-exp", text: "Card 5555 5555 5555 4444 exp 09/28 CVV 123", secrets: [["5555 5555", "H", "MC"], ["CVV 123", "H", "CVV"]] },
  { id: "cd-dots", text: "Visa 4111.1111.1111.1111 charged", secrets: [["4111.1111", "H", "card with dots"]] },
  { id: "cd-last4", text: "the card ending 4242 was billed", secrets: [], fpOK: true },
  { id: "cd-split", text: "card: 4111 1111\n1111 1111", secrets: [["4111 1111", "H", "card split over lines"]] },

  // ---------- bank ----------
  { id: "bk-iban", text: "Refund to IBAN GB82 WEST 1234 5698 7654 32 please.", secrets: [["GB82", "H", "IBAN country+check"], ["WEST", "M", "IBAN bank code"], ["32 please", "M", "IBAN tail"]] },
  { id: "bk-iban-compact", text: "IBAN DE89370400440532013000", secrets: [["DE89370400440532013000", "H", "compact IBAN"]] },
  { id: "bk-sortcode", text: "Sort code 20-00-00, account number 31926819.", secrets: [["20-00-00", "H", "sort code"], ["31926819", "H", "UK acct"]] },
  { id: "bk-ng-nuban", text: "Pay into GTBank 0123456789, acc name Adebayo Ogunlesi", secrets: [["0123456789", "H", "NUBAN"], ["Ogunlesi", "H", "acc name"]] },
  { id: "bk-ca-transit", text: "Transit 12345, institution 003, acct 1234567", secrets: [["1234567", "H", "CA acct"], ["12345", "M", "transit"]] },
  { id: "bk-routing", text: "ABA routing 021000021 and checking 000123456789", secrets: [["021000021", "H", "routing"], ["000123456789", "H", "checking acct"]] },

  // ---------- gov IDs ----------
  { id: "id-ssn", text: "SSN 123-45-6789 for verification", secrets: [["123-45-6789", "H", "US SSN dashed"]] },
  { id: "id-ssn-compact", text: "ssn is 123456789", secrets: [["123456789", "H", "SSN compact"]] },
  { id: "id-sin", text: "My SIN is 046 454 286.", secrets: [["046 454 286", "H", "Canada SIN"]] },
  { id: "id-ni", text: "NI number QQ 12 34 56 C", secrets: [["QQ 12 34 56 C", "H", "UK NI"], ["12 34 56", "H", "NI digits"]] },
  { id: "id-ni-compact", text: "NINO: AB123456C", secrets: [["AB123456C", "H", "UK NI compact"]] },
  { id: "id-passport", text: "Passport no. A12345678, expires 2031.", secrets: [["A12345678", "H", "passport"]] },
  { id: "id-passport-uk", text: "passport 533401372 issued London", secrets: [["533401372", "H", "UK passport digits"]] },
  { id: "id-bvn", text: "My BVN is 22123456789 and NIN 12345678901", secrets: [["22123456789", "H", "NG BVN"], ["12345678901", "H", "NG NIN"]] },
  { id: "id-aadhaar", text: "Aadhaar 2345 6789 0123", secrets: [["2345 6789 0123", "H", "Aadhaar"]] },
  { id: "id-dl", text: "Driver's licence SMITH801015JJ9AA", secrets: [["SMITH801015JJ9AA", "H", "UK DL"]] },
  { id: "id-dob", text: "DOB 14/03/1985, born March 14, 1985", secrets: [["14/03/1985", "M", "DOB numeric"], ["March 14, 1985", "M", "DOB words"]] },

  // ---------- references / tech ----------
  { id: "rf-pnr", text: "Booking ref: ABC123, PNR XYZ9KL.", secrets: [["ABC123", "M", "PNR after ref"], ["XYZ9KL", "M", "PNR keyword"]] },
  { id: "rf-pnr-bare", text: "My flight confirmation Q7RT2M was cancelled", secrets: [["Q7RT2M", "M", "bare PNR"]] },
  { id: "rf-tracking", text: "Tracking 1Z999AA10123456784 and Royal Mail AB123456789GB", secrets: [["1Z999AA10123456784", "M", "UPS"], ["AB123456789GB", "M", "Royal Mail"]] },
  { id: "rf-ip", text: "Login from IP 192.168.1.10 and 2001:db8::1 was not me", secrets: [["192.168.1.10", "M", "IPv4"], ["2001:db8::1", "M", "IPv6"]] },
  { id: "rf-imei", text: "IMEI 490154203237518 is my phone", secrets: [["490154203237518", "M", "IMEI (Luhn 15)"]] },
  { id: "rf-account-word", text: "my account is 88213377 and customer ID CUST-99812", secrets: [["88213377", "H", "acct"], ["CUST-99812", "M", "customer id"]] },

  // ---------- addresses ----------
  { id: "ad-us-apt", text: "Ship to 221 Baker Street, Apt 4B, Springfield, IL 62704", secrets: [["221 Baker Street", "H", "street"], ["Apt 4B", "M", "apt"], ["62704", "M", "ZIP"]] },
  { id: "ad-us-lower", text: "i live at 42 maple ave, boston ma 02115", secrets: [["42 maple ave", "H", "lowercase street"], ["02115", "M", "ZIP"]] },
  { id: "ad-pobox", text: "Mail it to PO Box 1234, Lagos", secrets: [["PO Box 1234", "H", "PO box"]] },
  { id: "ad-uk", text: "Address: Flat 3, 10 Downing Street, London SW1A 2AA", secrets: [["10 Downing Street", "H", "UK street"], ["SW1A 2AA", "M", "UK postcode"], ["Flat 3", "M", "flat"]] },
  { id: "ad-uk-lower-pc", text: "postcode is sw1a 2aa", secrets: [["sw1a 2aa", "M", "lowercase UK pc"]] },
  { id: "ad-ca", text: "Unit 1204 - 1420 Elbow Drive SW, Calgary AB T2S 2N4", secrets: [["1420 Elbow Drive", "H", "CA street"], ["T2S 2N4", "M", "CA pc"], ["Unit 1204", "M", "unit"]] },
  { id: "ad-ca-numbered", text: "I'm at 123 17 Avenue SE, Calgary", secrets: [["123 17 Avenue", "H", "numbered street"]] },
  { id: "ad-ng", text: "Deliver to 15 Adeola Odeku Street, Victoria Island, Lagos", secrets: [["Adeola Odeku Street", "H", "NG street"]] },
  { id: "ad-ng-close", text: "No 7, Olorunsogo close, off Allen Avenue, Ikeja", secrets: [["Olorunsogo close", "H", "NG lowercase close"]] },
  { id: "ad-us-multiword-dir", text: "Send to 500 N Michigan Ave Suite 600, Chicago", secrets: [["500 N Michigan Ave", "H", "street with direction prefix"]] },
  { id: "ad-hyphen", text: "my address 12 Saint-Laurent Boulevard, Ottawa", secrets: [["Saint-Laurent Boulevard", "H", "hyphenated street"]] },

  // ---------- names ----------
  { id: "nm-greeting-here", text: "Hi, Tunde here. My refund never came.", secrets: [["Tunde", "H", "name in 'X here'"]] },
  { id: "nm-mr-signoff", text: "Please fix this.\n\nRegards,\nMr. Adebayo", secrets: [["Adebayo", "H", "title in signoff"]] },
  { id: "nm-yoruba-diacritic", text: "My name is Adébáyọ̀ Ọlágúnjú and I want a refund.", secrets: [["Adébáyọ̀", "H", "Yoruba diacritics first"], ["Ọlágúnjú", "H", "Yoruba diacritics last"]] },
  { id: "nm-igbo", text: "My name is Chiamaka Nwosu-Eze. The parcel is missing.", secrets: [["Chiamaka", "H", "first"], ["Nwosu-Eze", "H", "hyphenated surname"]] },
  { id: "nm-chinese", text: "Hello, I am Wang Xiaoming (王小明). Please call.", secrets: [["Wang", "H", "Chinese pinyin"], ["王小明", "H", "Chinese characters"]] },
  { id: "nm-arabic", text: "My name is Mohammed bin Rashid Al-Maktoum, booking failed.", secrets: [["Mohammed", "H", "first"], ["Al-Maktoum", "H", "Al- surname"]] },
  { id: "nm-spanish", text: "Soy María José García Márquez, my order is late.\n\nGracias,\nMaría José García Márquez", secrets: [["García", "H", "Spanish surname"], ["Márquez", "H", "Spanish 2nd surname"], ["María", "H", "first"]] },
  { id: "nm-lowercase", text: "hi my name is sarah jones and my bill is wrong", secrets: [["sarah jones", "H", "lowercase name"]] },
  { id: "nm-mac-o", text: "Regards,\nSeán O'Brien-McDonald", secrets: [["O'Brien", "H", "apostrophe surname"], ["McDonald", "H", "Mc surname"]] },
  { id: "nm-allcaps", text: "MY NAME IS JOHN SMITH AND I AM FURIOUS", secrets: [["JOHN SMITH", "H", "all caps name"]] },
  { id: "nm-family", text: "I'm Emeka. My wife Ngozi and my kids Chidi and Ada were on the flight.", secrets: [["Ngozi", "H", "spouse"], ["Chidi", "H", "child 1"], ["Ada", "H", "child 2"]] },
  { id: "nm-husband-fullname", text: "My husband Oluwaseun Adeyemi booked it.", secrets: [["Adeyemi", "H", "husband surname"]] },
  { id: "nm-common-words", text: "This is Will. Will you refund me? My daughter Rose loves the Mark 2 phone.", secrets: [["Will.", "H", "name Will"]], fp: ["Will you", "Mark 2"] },
  { id: "nm-rose-signoff", text: "The roses arrived dead.\n\nThanks,\nRose", secrets: [["\nRose", "H", "Rose signoff"]], fp: ["roses"] },
  { id: "nm-dr-title", text: "Dear team, Dr. Funmilayo Ransome-Kuti is the account holder.", secrets: [["Funmilayo", "H", "Dr. title"], ["Ransome-Kuti", "H", "hyphen surname"]] },
  { id: "nm-signoff-dash", text: "Fix my bill.\n- Kemi", secrets: [["Kemi", "H", "dash signoff"]] },
  { id: "nm-signoff-title-line", text: "Sorted?\n\nBest,\nPriya Patel\nSenior Manager, Acme Ltd", secrets: [["Priya", "H", "first"], ["Patel", "H", "surname"]] },
  { id: "nm-from-header", text: "From: Li Wei <li.wei@163.com>\nSubject: refund\n\nwhere is it", secrets: [["Li Wei", "H", "From header name"]] },
  { id: "nm-for-name", text: "The booking is under the name Okonkwo, first name Obinna.", secrets: [["Okonkwo", "H", "surname"], ["Obinna", "H", "first"]] },
  { id: "nm-im-lower", text: "im fatima, my sim is blocked", secrets: [["fatima", "H", "lowercase i'm"]] },
  { id: "nm-kids-names-list", text: "Tickets for me, Bisi, Tolu and Femi please.", secrets: [["Bisi", "H", "list name"], ["Tolu", "H", "list name"], ["Femi", "H", "list name"]] },
];

// Strings that MUST survive masking (false-positive probes).
export const FP = [
  "I paid $1,234.56 and then £2,500.00 again.",
  "Charged 1234567.89 CAD total",
  "On 25/11/2026 at 14:30, and again 2026-11-25T09:15:00Z.",
  "I ordered 12 units, then 1500 more, then 25000 boxes.",
  "Product code WX-2000-B and SKU 88412-77 are wrong.",
  "Flight BA0117 and EK 783 were delayed in 2024 and 2025.",
  "Model iPhone 15 Pro Max 256GB, firmware 17.4.1",
  "Quantity: 3. Price: 19.99. Ticket 55 is fine.",
  "Between 1990 and 2026 I paid 120000 naira.",
  "Order total 1,234,567 points earned from 2019 to 2024",
  "Call centre wait 45 minutes, gate B12, seat 14C, terminal 5",
  "Version 2.3.4, build 20241125, error code 0x80070005",
  "I was charged 3 times: 29.99, 29.99 and 29.99 in 1 2 3 4 5 6 7 8 9 10 seconds",
  "Room 1204 for 2 nights from 12 Jan to 14 Jan 2026",
  "Hi team, Thanks for help. Regards, Support",
  "It cost 4111 1111 dollars", // 8 digits, not a phone
  "Flight AC 1234 5678 9012", // ambiguous
  "May I get a refund? June was bad too.",
];
