# Interview questions: AI in Australian Courts

The twenty hardest questions this project is likely to face, each answered from the decisions log (DECISIONS.md,
cited by entry number) and the README. The answers go no further than what the repository records.

### Why not PelAIkan or LawCite?
They do different jobs, and the CiteCheck "other tools" page says so (D038). LawCite is AustLII's citator and JADE
links cases to the cases that cite them; PelAIkan, built by Damien Charlotin, is an automated reference checker; Lexis+
AI and Westlaw are subscription platforms. CiteCheck AU is a free triage step, not a replacement for a citator. What it
adds: it checks every citation in a whole document at once and gives the reason for each result; it runs in the
browser on an open snapshot, so the document is never uploaded; it compares the party names written with the record,
which catches a real citation attached to the wrong case; and it says plainly when it cannot check something (D037,
D038). What it cannot do: say whether a case supports the point it is cited for, or check anything outside its corpus.
LawCite and JADE are linked only at their home pages until their per-citation link formats are confirmed (D037, D038).

### Why is n so small?
Two samples are small, and both are deliberate. Tracker accuracy rests on a random spot-check of 10 rows (seed
20261031, from 94 eligible rows), which Luc chose instead of checking every lawyer row and every superior-court row by
hand (D016, D023). It found 72 of 79 judgement fields correct, 91.1%, with a Wilson 95% interval of 82.8–95.6% (D025):
the interval is reported because n is small, and it is wide. For CiteCheck, there are 65 fake citations that courts
identified and Luc read (D031, D034), but the corpus covers only the High Court, the Federal Court and NSW, up to 10
March 2025, so only about 15 of them fall within coverage. That is too few for a rate, so each will be described rather
than summed (D034); the 396
synthetic corruptions give the larger samples (D036). The tracker itself is not a sample: it holds every Australian row
of Charlotin's database, 112 decisions, so its counts describe that database, not all Australian courts (D002).

### Why should anyone trust fields a language model extracted?
The trust rests on checks the model cannot influence. The model must quote: each finding comes back tied to an exact
passage, and each quote is checked against the judgment text after the same normalisation on both sides (rapidfuzz
partial_ratio of 97 or more), then mapped to its page and paragraph (D007, D010). The field-proposal pass sees only
quotes that passed, and code blanks any value whose quote IDs are empty or unknown, whatever the model returned (D012).
Automatic checks then run on every row (D016). Together these show that each value rests on real text at the stated
paragraph. They cannot show that the model read the text correctly, which is why accuracy is estimated separately, from
Luc's random spot-check (D016, D025).

### What does "auto-verified" actually prove?
That every value rests on a quote found in the copy held, with a paragraph number; that the citation matches the
judgment's header; that titles and impugned citations are copied exactly; that each characterisation has a textual
cue; and that party type and referral agree with Charlotin's coding (D016). It does not prove the reading is right. The
spot-check shows the gap: 4 of 10 rows had every judgement field right, and the errors were omissions and over-calls,
such as "submissions_disregarded" and "found_by_court" where the court had only suspected AI use (D025). Those patterns
bear on the auto-verified rows, which no person has read (D025). The checks also compare against the copy held, usually
an AustLII print rather than the authorised version (D016), and most auto-verified rows are held back for now (D042).

### The spot-check sample was fixed by seed before extraction, but the git history was squashed. What does that prove?
Less than the phrase suggests. The sample is drawn by a committed script from a fixed seed (20261031) and the list of
eligible rows, leaving out the 10 rows used to develop the prompts (D008, D016), so anyone can re-run it and get the
same 10 rows. What git cannot show is the order of events: the history was rewritten for privacy and published again as
a single commit (D022), so the sample and the extraction outputs arrive together. The defence is that the draw can be
reproduced from its seed, not a timestamp, and nothing was lodged with a third party. The tuning of the automatic
checks could not influence which rows were drawn (D021).

### All 1,615 quotations matched character for character. Isn't that strong evidence of accuracy?
No: it is a traceability check. Quotes come back from the API as character offsets into exactly the text that was
sent, and the sent text's hash is recorded (D007), so an exact match is close to guaranteed by construction. It shows
that every quote exists in the source at a known place, which is what lets each field be audited (D010, D020). Whether
a quote supports its field is a separate question, answered only by a person reading the judgment: the spot-check
(D025).

### Why are most tracker rows held back?
Because of AustLII. The code never fetches AustLII (D005), but most of the judgment copies Charlotin hosts are AustLII
printouts: of the 104 judgments whose stripped text was sent for extraction, 94 were AustLII prints (D007). AustLII
reserves AI uses, and when asked for his reasons for approving that use, Luc answered that he was unsure it was
acceptable (D007). He chose to ask AustLII directly and to launch before a reply under one rule: fields the AI
extracted from an AustLII copy are not published, while facts read by script, Charlotin's coding and anything Luc read
himself are (D024, D035, D042). As a result 84 rows are held back (data/stats.json). If AustLII agrees, one switch in the
build removes the hold; if not, the AI-derived fields are deleted and the change is logged (D024).

### How do you protect self-represented litigants?
By rules Luc signed off, and a check. On the site, rule B1: self-represented parties' case titles are not shown; each
row is identified by its medium neutral citation and a neutral ID such as AIC-0001, and the tracker can be filtered but
not searched by name (D015, D022). Rule C1 covers the repository: files that hold those parties' names are gitignored,
and only their SHA-256 hashes are published, so anyone with the same files can confirm they match (D022). The tracker
page and the downloads are noindexed (D015). The check is a committed scan, scripts/30_privacy_scan.py: it builds the
list of those parties' case titles from the local name files, looks for them in the tracked files (the evaluation
folder is left to Luc), and prints counts, file paths and line numbers only, never a name. Family law rows use only the
court's anonymised title (PRIVACY.md).

### Are the name fingerprints anonymous?
No, and the project does not claim they are. Each identifying word of a party name becomes the first 3 bytes of its
SHA-256, in base64url (D033). That keeps a readable list of names from about 189,000 decisions out of the public
files, but fingerprints of common surnames can be guessed by hashing a name list, so this is pseudonymisation, not
anonymity (D031). The cost was accepted knowingly: a misspelt name counts as a mismatch, which will show up as false
alarms (D031). Luc chose this option over publishing titles as the corpus records them (D031).

### How do you keep the evaluation honest?
By fixing things in a recorded order, and by keeping the tool away from the test items. The corruption generator,
aic/corrupt.py, was committed before any parser or matcher code, and its labels come from the indexes, not from the
matcher (D030). 2% of judgments (3,750, seed 20261026) were reserved as evaluation sources and committed before any
index was mined, and index (b) excludes them (D032). The real evaluation citations were found with separate Python
patterns, not the shipped parser, so citations the parser cannot read count against it (D029, D033). The matcher's
defaults were set before any evaluation, and nothing has been run against the evaluation items: that waits until Luc
freezes the set, and tuning then uses the dev split only (D037).

### Why does CiteCheck never say "verified"?
Because a match in an index is not verification. FOUND means a record with this citation exists and, where names are
given, the party names match; it says nothing about whether the case supports the proposition (D037). The four states
are FOUND, MISMATCH, NO_RECORD and CANNOT_CHECK, each shown with its reason, and the page never uses "verified" or "good
law" of a result (D037, D038). The page tells users that a "Found" result is not the checking that court practice notes
require: open the source and read the cited passage (D038).

### Why does a NSW Land and Environment Court citation come back "cannot check"?
Because absence proves little there. The corpus scan found that about 47% of that court's decision numbers are missing
every year, against under 4% for recent Federal Court and NSW Supreme Court years (D032). A missing number in such a
court-year is weak evidence that a case does not exist, so above a gap-rate threshold the result is CANNOT_CHECK rather
than NO_RECORD (D037). The threshold, 15%, was fixed before any evaluation; it is a setting to tune on the dev split
after the freeze, not by eye (D037).

### Isn't the report index circular, since the parser you test also built it?
Partly, and the design limits the damage. Index (b) is mined with the shipped parser so that its keys are exactly what
the site looks up (D033). If the evaluation's citations came from the same parser, citations it cannot read would never
enter the test, and recall would look perfect. So the real evaluation citations are found in the reserved judgments
with a separate, deliberately broad set of Python patterns, and anything the parser misses counts against it (D029,
D033). What remains: reports the parser cannot read are missing from index (b) itself, so recall on unusual report
forms is unknown until the evaluation runs. Only reports cited by at least two judgments are indexed, so a real but
rarely cited report can come back as "no record" (D037).

### Tell me about a bug you found.
Report keys. In square-bracket series such as the Queensland Reports, volumes run within a year, so [1990] 1 Qd R 5
and [1991] 1 Qd R 5 are different reports, but index (b) keyed reports by volume and page alone and merged them (D036).
The fix was one key function, shared by the TypeScript and Python code, that adds the year for square series; the
generator's interface was changed to pass the year, in a commit made before any matcher code, with its corruption types
and labels unchanged (D036). Rebuilding raised the distinct reports mined from 93,006 to 107,436 (D036). An earlier
one: pandas itertuples() renamed a column called "pass", a Python keyword, so every quote looked unverified; it was
fixed with a regression test (D021).

### What does CiteCheck cover, and what can it not check?
Case law from the Open Australian Legal Corpus v7.1.0, current to 10 March 2025: the High Court, the Federal Court and
NSW courts and tribunals, with no Victorian, Queensland, WA, SA or Tasmanian case law (D029). Index (a) holds 187,443
decisions by medium neutral citation (D033). Report citations can be checked only if at least two judgments in the
corpus cite them (D033, D037). Commonwealth Acts are checked against the Federal Register's full list, former names
included, and section numbers are read live from the version in force; state Acts are checked by title only, as in
force at the snapshot; Victorian, ACT and NT legislation cannot be checked (D037). Anything outside that comes back as
CANNOT_CHECK with the reason, never as a silent pass (D037).

### How do you avoid overstating what a court found?
By recording the court's own words at the court's own strength. The tracker's ai_use field separates admitted, found
by the court, suspected and denied, so a suspicion is never shown as an admission (D013). A court that says only that a
case "could not be found" is recorded as not_located, not non_existent (D013). Each impugned citation records who said
it was false, the court or a party, and only the court's own characterisations are presented as findings (D018). The
spot-check still found over-calls of "found_by_court" where the court had only suspected AI use, which is why the
accuracy estimate matters (D025).

### How was the rules matrix built and checked?
Each cell is a plain-English summary backed by short verbatim quotations with paragraph numbers, and a script checks
that every quotation occurs in the official text inside the cited paragraph, reading paragraph spans from each
instrument's own numbering (D019). That check exposed a parser error: a wrapped line beginning "41 and 57 of the
Barristers' Conduct Rules" had been read as paragraph 41, so a paragraph number is now accepted only as a plausible
next number (D026). Instruments were fetched only after checking each site's robots.txt; where a site refused automated
requests, Luc saved the document in his own browser (D026, D028). Luc checked the instruments' cells in the review page
(D025, D028), and all 233 quotations verify inside their cited paragraphs (D028).

### How will you tune CiteCheck without fooling yourself?
The tracker's checks set the pattern: they were tuned on the full data, but only to remove false alarms on principle,
never to let a particular row pass, and the accuracy estimate comes only from the random spot-check, which no tuning
could influence (D021). For CiteCheck, the defaults (a 15% gap threshold, the "every side" party rule, Crown words
ignored) were fixed before any evaluation, and after Luc freezes the evaluation set they are tuned on the dev split only
(D037); the held-out split is kept apart for the final measurement. The split is by source judgment, and authorities
that landed in both splits were dropped from both, so dev and held-out do not share cases (D033, D036).

### How did you control API spend?
Every estimate printed both model prices, the exact input tokens came from the free count-tokens endpoint before each
batch, and any batch over US$10 needed Luc's explicit yes (D009). Extraction used Message Batches, at half the usual
price (D009). Total spend was US$9.88 against a cap of US$30 (CHANGELOG.md).

### How did you use AI to build this?
As the README's "Contributions and AI use" section says, the project was built with Claude Code (Anthropic), an AI
coding assistant, directed and reviewed by Luc: the pipeline scripts, the review page, the site code, CiteCheck AU, and
first drafts of the rules matrix cells and the checklist. The first-pass extraction of fields from judgments uses Claude
models through the API, and every such field records the verbatim quote it rests on. Luc designed the project and its
scope, decided each judgement call in DECISIONS.md (many first proposed by Claude; each entry shows whether he approved
it), checked the random rows, the fake citations and the flagged rows against the judgments, checked the rules matrix,
and approved each release (D025, D034, D042). The website itself does not name the model, by Luc's choice; the README
keeps the full disclosure (D039, D040).
