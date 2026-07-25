#!/usr/bin/env python3
"""
paygrep_judgments — the human half of filter (f).

paygrep.py extracts candidate statements. It deliberately does NOT judge
affiliation, because a vendor saying "we charge $99/mo" and a buyer saying
"we pay $99/mo" match the same surface pattern. This file records the
affiliation judgment made by research-thompson on 2026-07-25 over the 269
statements in /tmp/paygrep_hits.json, keyed by (corpus, author).

CLASSES
  BUYER-PAYS   non-affiliated person reports paying for the thing today
  BUYER-WANTS  non-affiliated, wants to pay, has not (weaker -- labelled)
  BUYER-AGAINST a buyer stating the thing is a reason NOT to buy (disconfirming)
  VENDOR       the speaker sells it / deposits it / consults on it
  HIRING       HN "Who is hiring" / "Who wants to be hired" recruiting text
  NOISE        incidental use of a payment word

Unlisted (corpus, author) pairs default to NOISE.
Run: python3 scripts/research/paygrep_judgments.py
"""
import json, sys
from collections import Counter, defaultdict

J = {
 # ---- escrow (4 corpora) -------------------------------------------------
 ("escrow_source_code","amath"):"VENDOR", ("escrow_source_code","corruption"):"VENDOR",
 ("escrow_source_code","mooreds"):"VENDOR", ("escrow_source_code","FireBeyond"):"VENDOR",
 ("escrow_source_code","cyberferret"):"VENDOR", ("escrow_source_code","robterrell"):"VENDOR",
 ("escrow_source_code","elric"):"VENDOR", ("escrow_source_code","skue"):"VENDOR",
 ("escrow_source_code","gtsteve"):"BUYER-WANTS", ("escrow_source_code","abstractbeliefs"):"BUYER-WANTS",
 ("escrow_source_code","lsllc"):"BUYER-WANTS", ("escrow_source_code","Johnny555"):"BUYER-WANTS",
 ("software_escrow","skue"):"VENDOR", ("software_escrow","cyberferret"):"VENDOR",
 ("software_escrow","specialist"):"VENDOR", ("software_escrow","eitally"):"BUYER-WANTS",
 ("software_escrow","gregmac"):"BUYER-AGAINST",
 ("source_code_escrow","amath"):"VENDOR", ("source_code_escrow","corruption"):"VENDOR",
 ("source_code_escrow","elric"):"VENDOR", ("source_code_escrow","mooreds"):"VENDOR",
 ("source_code_escrow","lsllc"):"BUYER-WANTS",
 ("Iron_Mountain_escrow","skue"):"VENDOR", ("Iron_Mountain_escrow","ci5er"):"BUYER-WANTS",
 # ---- FOSSA / license compliance ----------------------------------------
 ("FOSSA_license_compliance","XiZhao"):"HIRING",
 ("FOSSA_license_compliance","lexokoh"):"VENDOR", ("FOSSA_license_compliance","hgs3"):"VENDOR",
 ("FOSSA","freeqaz"):"VENDOR", ("FOSSA","cess11"):"NOISE",
 # ---- security questionnaire --------------------------------------------
 ("security_questionnaire","emremm"):"VENDOR",        # Launch HN: Stacksi (YC W21)
 ("security_questionnaire","_slih"):"VENDOR",         # consultant, gets paid
 ("security_questionnaire","TaeThePharaoh"):"BUYER-WANTS",   # also aspiring vendor
 ("security_questionnaire","lbriner"):"NOISE",        # pain, no payment stated
 ("security_questionnaire","bitbasher"):"BUYER-AGAINST",
 ("security_questionnaire","xyzzy_plugh"):"BUYER-AGAINST",
 ("security_questionnaire","jeromebrock"):"HIRING", ("security_questionnaire","balousek"):"HIRING",
 # ---- compliance automation / GRC ---------------------------------------
 ("compliance_automation","bitlad"):"BUYER-PAYS",     # Sprinto, ~$4000/yr
 ("compliance_automation","arjavmehta"):"VENDOR", ("compliance_automation","singularity99"):"VENDOR",
 ("compliance_automation","oscarsixsecllc"):"VENDOR", ("compliance_automation","guptadeepak"):"VENDOR",
 ("compliance_automation","neonnomad"):"HIRING", ("compliance_automation","rtlo9962"):"HIRING",
 ("compliance_automation","more_corn"):"HIRING", ("compliance_automation","benpotter"):"HIRING",
 ("compliance_automation","itaifrenkel"):"HIRING", ("compliance_automation","kaiterraliam"):"VENDOR",
 ("Vanta","lewisbuildsai"):"VENDOR", ("Vanta","mlitwiniuk"):"VENDOR",
 ("Vanta","brian_kuan"):"VENDOR", ("Vanta","jscheel"):"VENDOR", ("Vanta","brownrout"):"VENDOR",
 ("Vanta","TaeThePharaoh"):"BUYER-WANTS", ("Vanta","tptacek"):"BUYER-AGAINST",
 ("Vanta","AnBouch"):"NOISE",                          # 3rd-party survey, not 1st person
 ("Drata","lewisbuildsai"):"VENDOR", ("Drata","mlitwiniuk"):"VENDOR",
 ("Drata","tptacek"):"BUYER-AGAINST", ("Drata","film42"):"BUYER-PAYS",
 ("Drata","RileyJames"):"VENDOR", ("Drata","debarshri"):"VENDOR", ("Drata","asdxrfx"):"VENDOR",
 # ---- pentest -------------------------------------------------------------
 ("penetration_test_report","dsacco"):"VENDOR", ("penetration_test_report","raesene4"):"VENDOR",
 ("penetration_test_report","SecurityAmoeba"):"VENDOR", ("penetration_test_report","MrTurvey"):"VENDOR",
 ("penetration_test_report","pallaxa"):"VENDOR", ("penetration_test_report","aimed_guendouz"):"VENDOR",
 ("penetration_test_report","jeffreyip"):"VENDOR", ("penetration_test_report","glimow"):"VENDOR",
 ("penetration_test_report","tptacek"):"VENDOR", ("penetration_test_report","cj"):"BUYER-PAYS",
 ("penetration_test_report","jwr"):"BUYER-AGAINST",
 # ---- translation / localization -----------------------------------------
 ("translation_management_system","Intrepidd"):"VENDOR", ("translation_management_system","Donder"):"VENDOR",
 ("translation_management_system","toutoulliou"):"VENDOR", ("translation_management_system","jsunderland323"):"VENDOR",
 ("translation_management_system","jpomykala"):"VENDOR", ("translation_management_system","KTamasEnty"):"HIRING",
 ("Lokalise","Donder"):"VENDOR", ("Lokalise","Intrepidd"):"VENDOR",
 ("Crowdin","crubier"):"NOISE",   # pays for GitLab/Notion, not translation
 # ---- accessibility -------------------------------------------------------
 ("accessibility_audit","raigol"):"HIRING", ("accessibility_audit","pascalo"):"VENDOR",
 ("accessibility_audit","PaulHoule"):"NOISE",
 # ---- misc small ----------------------------------------------------------
 ("code_audit_due_diligence","bitcoinputer"):"VENDOR", ("code_audit_due_diligence","hvindin"):"BUYER-AGAINST",
 ("audit_evidence","arjavmehta"):"VENDOR",
 ("SBOM","NathanFlurry"):"VENDOR", ("SBOM","jesserwilliams"):"VENDOR", ("SBOM","torrienaylor"):"VENDOR",
 ("SOX_compliance","mholm"):"HIRING",
 ("Zenodo_DOI","RyukuLogos"):"VENDOR", ("Zenodo_DOI","peerlesscasual"):"VENDOR",
 ("Zenodo_DOI","adistan"):"VENDOR", ("Zenodo_DOI","AutoJanitor"):"VENDOR", ("Zenodo_DOI","dMobiuS3"):"VENDOR",
 ("CLA_assistant_contributor_license","tripalip"):"VENDOR", ("CLA_assistant_contributor_license","jmathai"):"VENDOR",
 ("DORA_metrics","dhruvagga"):"VENDOR",
 ("export_control_software","magate"):"HIRING",
}

def main():
    hits = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "/tmp/paygrep_hits.json"))
    per = defaultdict(Counter); seen = set(); tot = Counter()
    for h in hits:
        key = (h["corpus"], h["author"])
        cls = J.get(key, "NOISE")
        if key in seen:      # count each PERSON once per corpus, not each regex span
            continue
        seen.add(key)
        per[h["corpus"]][cls] += 1
        tot[cls] += 1
    cols = ["BUYER-PAYS","BUYER-WANTS","BUYER-AGAINST","VENDOR","HIRING","NOISE"]
    print("%-36s %s" % ("corpus (distinct people)", "  ".join("%-13s" % c for c in cols)))
    print("-" * 128)
    for c in sorted(per, key=lambda k: -sum(per[k].values())):
        print("%-36s %s   n=%d" % (c, "  ".join("%-13d" % per[c][k] for k in cols), sum(per[c].values())))
    print("-" * 128)
    print("%-36s %s   n=%d" % ("TOTAL (person-in-corpus)", "  ".join("%-13d" % tot[k] for k in cols), sum(tot.values())))

if __name__ == "__main__":
    main()
