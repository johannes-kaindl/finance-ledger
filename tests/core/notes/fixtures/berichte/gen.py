"""Erzeugt die synthetischen Eingaben der Berichts-Goldmuster: `python3 gen.py <zielordner>`.

Alles erfunden (Jane Doe, Acme Bank). Die Goldmuster unter golden/ stammen aus einem Lauf des Python-Importers
(`--all-aggregates`) auf genau diesen Eingaben am 2026-10-16."""
import random, shutil, sys
from pathlib import Path
R = random.Random(23)
root = Path(sys.argv[1]); shutil.rmtree(root, ignore_errors=True)
(root/"Umsätze").mkdir(parents=True); (root/"55-Categorizer-Rules").mkdir()
KONTEN = [
 ("GB00ACME00000001","hauptkonto_privat","giro","camt52","Konto 01 – Everyday Checking.md","Aktiva:Bank:Everyday Checking"),
 ("GB00ACME00000002","familienpool","giro","camt52","Konto 02 – Household Pool.md","Aktiva:Bank:Household Pool"),
 ("GB00ACME00000003","visa_daily","kreditkarte","sparkasse_visa","Konto 03 – Everyday Visa.md","Passiva:Credit Card:Everyday Visa"),
 ("GB00ACME00000004","vermietung","giro","camt52","Konto 04 – Rental.md","Aktiva:Bank:Rental"),
]
y = ["konten:"]
for i,(iban,rolle,typ,sch,fn,led) in enumerate(KONTEN):
    schema = "sparkasse_camt52" if sch=="camt52" else "sparkasse_visa"
    y += [f"  - id: k{i+1}", f"    iban: {iban}", f'    ledger_account: "{led}"', "    bank: Acme Bank", "    bic: ACMEGB2L",
          f"    konto_typ: {typ}", f"    konto_rolle: {rolle}", f"    csv_schema: {schema}", "    inhaber: Jane Doe", f'    filename: "{fn}"',
          "    sticker: lucide//landmark", '    rolle_beschreibung: "Testkonto"', "    aliases: []"]
(root/"konten.yaml").write_text("\n".join(y)+"\n", encoding="utf-8")
RULES = [("acme power","Ausgaben:Wohnen:Strom"),("hausverwaltung","Ausgaben:Wohnen:Miete"),("northwind","Ausgaben:Lebensmittel:Northwind"),
 ("globex","Einnahmen:Gehalt:Globex"),("mieter","Einnahmen:Miete:Mieter"),("initech","Ausgaben:Tech_Abos:Streaming"),
 ("soylent","Ausgaben:Essen_Auswaerts:Cafe"),("metro","Ausgaben:Mobilitaet:OPNV"),("pharmacy","Ausgaben:Gesundheit:Apotheke"),
 ("insure","Ausgaben:Versicherung:Haftpflicht"),("telco","Ausgaben:Kommunikation:Mobil"),("kontofuehrung","Ausgaben:Bankgebuehren:Konto"),
 ("handwerker","Ausgaben:Sonstiges:Einmalig:Reparatur"),("spende verein","Ausgaben:Spende:Verein"),("finanzamt","Ausgaben:Steuern:Einkommen"),
 ("cinema","Ausgaben:Freizeit:Kino"),("shopmax","Ausgaben:Online_Shopping:Shopmax"),("club","Ausgaben:Mitgliedschaft:Club"),("miller","Ausgaben:Wohnen:Bewirtschaftung")]
for p,a in RULES:
    (root/"55-Categorizer-Rules"/f"{p}.md").write_text(f'---\nkategorie: categorizer-rule\npattern: {p}\npattern_type: substring\nledger_account: "{a}"\npriority: 50\ntags: []\n---\n\n# Rule: {p}\n', encoding="utf-8")
def de(v): return f"{v:.2f}".replace(".",",")
def rowcamt(iban,d,text,zweck,partner,betrag,gl="",mandat=""):
    return f"{iban};{d};{d};{text};{zweck};{gl};{mandat};;;;;{partner};;;{de(betrag)};EUR;Umsatz gebucht"
HDR="Auftragskonto;Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Glaeubiger ID;Mandatsreferenz;Kundenreferenz (End-to-End);Sammlerreferenz;Lastschrift Ursprungsbetrag;Auslagenersatz Ruecklastschrift;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;BIC (SWIFT-Code);Betrag;Waehrung;Info"
VHDR="Umsatz getaetigt von;Belegdatum;Buchungsdatum;Originalbetrag;Original Waehrung;Umrechnungskurs;Betrag;Waehrung;Beschreibung;Stadt;Referenznummer;MCC;Laenderkennzeichen;Kartennummer;Buchungstext;Zusatz"
months=[(2025,m) for m in range(10,13)]+[(2026,m) for m in range(1,11)]
k1=[HDR];k2=[HDR];k4=[HDR];vis=[VHDR]
for (yy,m) in months:
    ds=lambda d:f"{d:02d}.{m:02d}.{yy%100:02d}"
    k1.append(rowcamt(KONTEN[0][0],ds(1),"GUTSCHRIFT","Gehalt","Globex Corporation",3200+R.randint(0,5)*50))
    k1.append(rowcamt(KONTEN[0][0],ds(2),"LASTSCHRIFT","Strom","Acme Power",-(80+R.randint(0,40)),"DE98ZZZ00000000001","MANDAT-ACME-001"))
    k1.append(rowcamt(KONTEN[0][0],ds(3),"ONLINE-UEBERWEISUNG","Miete","Hausverwaltung Nord",-950))
    k1.append(rowcamt(KONTEN[0][0],ds(4),"LASTSCHRIFT","Handy","Telco One",-29.99))
    for d in (5,12,19,26):
        k1.append(rowcamt(KONTEN[0][0],ds(d),"KARTENZAHLUNG","Einkauf","Northwind Grocers",-(30+R.randint(0,5000)/100)))
    k1.append(rowcamt(KONTEN[0][0],ds(8),"KARTENZAHLUNG","Metro Ticket","Metro Transit",-49.0))
    k1.append(rowcamt(KONTEN[0][0],ds(10),"LASTSCHRIFT","Versicherung","Insure AG",-(55.5 if m%2 else 12.25),"DE98ZZZ00000000002","MANDAT-INSURE-7"))
    k1.append(rowcamt(KONTEN[0][0],ds(15),"ENTGELT","Kontofuehrung","Acme Bank Kontofuehrung",-4.9))
    k1.append(rowcamt(KONTEN[0][0],ds(16),"KARTENZAHLUNG","Kino","Cinema City",-(R.randint(900,2500)/100)))
    k1.append(rowcamt(KONTEN[0][0],ds(17),"ONLINE-UEBERWEISUNG","Unbekannt","Zufallsfirma "+str(R.randint(1,9)),-(R.randint(500,9000)/100)))
    k1.append(rowcamt(KONTEN[0][0],ds(20),"ONLINE-UEBERWEISUNG","Umbuchung","Jane Doe",-200))
    k2.append(rowcamt(KONTEN[1][0],ds(20),"GUTSCHRIFT","Umbuchung","Jane Doe",200))
    k2.append(rowcamt(KONTEN[1][0],ds(22),"KARTENZAHLUNG","Apotheke","Pharmacy Plus",-(R.randint(300,4000)/100)))
    if m in (3,6,12):
        k2.append(rowcamt(KONTEN[1][0],ds(23),"ONLINE-UEBERWEISUNG","Spende","Spende Verein e.V.",-25))
        k2.append(rowcamt(KONTEN[1][0],ds(24),"LASTSCHRIFT","Beitrag","Sports Club",-120))
    if m == 4: k1.append(rowcamt(KONTEN[0][0],ds(28),"ONLINE-UEBERWEISUNG","Steuer","Finanzamt Mitte",-1234.56))
    k4.append(rowcamt(KONTEN[3][0],ds(1),"GUTSCHRIFT","Miete","Mieter Meier",780))
    k4.append(rowcamt(KONTEN[3][0],ds(9),"ONLINE-UEBERWEISUNG","Reparatur","Handwerker Schmidt",-(R.randint(50,400)) if m%3==0 else -0.01*R.randint(1,9)))
    k4.append(rowcamt(KONTEN[3][0],ds(11),"LASTSCHRIFT","Nebenkosten","Miller Stadtwerke",-(60+R.randint(0,30))))
    vis.append(f"{KONTEN[2][0]};{ds(7)};{ds(9)};;;;{de(-(10+R.randint(0,2000)/100))};EUR;Initech Streaming;;;;;;;")
    vis.append(f"{KONTEN[2][0]};{ds(13)};{ds(14)};;;;{de(-(R.randint(500,3500)/100))};EUR;Soylent Cafe;;;;;;;")
    vis.append(f"{KONTEN[2][0]};{ds(18)};{ds(19)};;;;{de(-(R.randint(1000,9000)/100))};EUR;Shopmax Online;;;;;;;")
(root/"Umsätze"/"2026-10-31-ME00000001-camt52v8.CSV").write_text("\n".join(k1)+"\n",encoding="latin-1")
(root/"Umsätze"/"2026-10-31-ME00000002-camt52v8.CSV").write_text("\n".join(k2)+"\n",encoding="latin-1")
(root/"Umsätze"/"2026-10-31-ME00000004-camt52v8.CSV").write_text("\n".join(k4)+"\n",encoding="latin-1")
(root/"Umsätze"/"2026-10-31-4000-XXXX-XXXX-0003-visa.CSV").write_text("\n".join(vis)+"\n",encoding="latin-1")
print("ok", sum(len(x)-1 for x in (k1,k2,k4,vis)), "Buchungen")
