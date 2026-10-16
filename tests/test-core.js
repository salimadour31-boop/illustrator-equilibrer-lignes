// Tests du cœur pur (découpe, programmation dynamique, modifications) — node tests/test-core.js
// Pure-core tests (tokenizing, dynamic programming, edits).
var fs = require("fs"), vm = require("vm"), path = require("path");
var src = fs.readFileSync(path.join(__dirname, "..", "EquilibrerLignes.jsx"), "utf8");
var ctx = { EL_NO_MAIN: true }; vm.createContext(ctx); vm.runInContext(src + "\nthis.EL_CORE = EL_CORE;", ctx);
var C = ctx.EL_CORE, BR = "\u0003";
var pass = 0, fail = 0;
function ok(n, c, e) { if (c) { pass++; console.log("ok   " + n); } else { fail++; console.log("FAIL " + n + (e !== undefined ? " -> " + JSON.stringify(e) : "")); } }
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

// --- Découpe / tokenizing
var t = C.tokenize("Le  retour du roi", { small: C.wordSet("le du") });
ok("4 unités", t.units.length === 4, t.units.map(function (u) { return u.text; }));
ok("double espace = une coupe", t.gaps[0].s === 2 && t.gaps[0].e === 4);
ok("petit mot en fin d'unité", t.units[0].small && !t.units[1].small && t.units[2].small);
t = C.tokenize("10\u00A0km à pied", {});
ok("insécable colle les mots", t.units.length === 3 && t.units[0].text === "10\u00A0km");
t = C.tokenize("Bonjour" + BR + "le monde", {});
ok("retour forcé = coupe br", t.units.length === 3 && t.gaps[0].br === true);
t = C.tokenize("  avant   ", {});
ok("blancs de tête/fin ignorés", t.units.length === 1 && t.units[0].text === "avant" && t.lo === 2 && t.hi === 7);
t = C.tokenize("porte-avions géant", { hyphen: true });
ok("coupe après trait d'union", t.units.length === 3 && t.gaps[0].type === "hyphen" && t.units[0].text === "porte-");
t = C.tokenize("porte-avions géant", { hyphen: false });
ok("sans option : pas de coupe au trait d'union", t.units.length === 2);
t = C.tokenize("a b c", { noBreak: function (i) { return i === 1; } });
ok("attribut Sans retour respecté", t.units.length === 2 && t.units[0].text === "a b");
ok("lastWord retire la ponctuation", C.lastWord("« de,") === "de" && C.lastWord("The") === "the");
t = C.tokenize("الطريق إلى المدينة", { small: C.wordSet("إلى") });
ok("petit mot arabe", t.units.length === 3 && t.units[1].small);

// --- Programmation dynamique comparée à une recherche exhaustive / DP vs brute force
function brute(W, G, small, o) {
    var n = W.length, k = Math.min(o.k, n), best = null;
    function rec(start, left, breaks) {
        if (left === 1) {
            var br = breaks.slice(), ws = C.widths(W, G, br), cost = 0, ok2 = true, total = 0, i;
            for (i = 0; i < ws.length; i++) total += ws[i];
            var avg = total / k, pS = o.avoidSmall ? Math.pow(0.2 * avg, 2) : 0, p1 = (o.avoidSingle && n >= 2 * k) ? Math.pow(0.25 * avg, 2) : 0;
            // NB : avg du DP = largeur totale sur une ligne / k ; recalcul identique ci-dessous
            var L1 = C.widths(W, G, [])[0]; avg = L1 / k; pS = o.avoidSmall ? Math.pow(0.2 * avg, 2) : 0; p1 = (o.avoidSingle && n >= 2 * k) ? Math.pow(0.25 * avg, 2) : 0;
            var a = 0;
            for (i = 0; i < ws.length; i++) {
                var b = i < br.length ? br[i] : n - 1;
                if (o.maxWidth > 0 && ws[i] > o.maxWidth) ok2 = false;
                cost += ws[i] * ws[i];
                if (pS && b < n - 1 && small[b]) cost += pS;
                if (p1 && a === b) cost += p1;
                if (i > 0 && o.shape === "pyramid" && ws[i - 1] > ws[i] + L1 * 1e-6) ok2 = false;
                if (i > 0 && o.shape === "inverted" && ws[i - 1] + L1 * 1e-6 < ws[i]) ok2 = false;
                a = b + 1;
            }
            if (ok2 && (!best || cost < best.cost - 1e-9)) best = { breaks: br, cost: cost };
            return;
        }
        for (var e = start; e <= n - left; e++) { breaks.push(e); rec(e + 1, left - 1, breaks); breaks.pop(); }
    }
    rec(0, k, []);
    return best;
}
var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
var shapes = ["balanced", "pyramid", "inverted"], agree = 0, tries = 0, mism = null;
for (var r = 0; r < 240; r++) {
    var n = 2 + Math.floor(rnd() * 9), W = [], G = [], sm = [], i;
    for (i = 0; i < n; i++) { W.push(5 + Math.floor(rnd() * 60)); sm.push(rnd() < 0.25); }
    for (i = 0; i < n - 1; i++) G.push(3 + Math.floor(rnd() * 3));
    var o = { k: 2 + Math.floor(rnd() * 3), shape: shapes[r % 3], maxWidth: rnd() < 0.3 ? 90 : 0, avoidSmall: rnd() < 0.5, avoidSingle: rnd() < 0.5 };
    var d = C.balance(W, G, sm, o), b = brute(W, G, sm, o);
    tries++;
    if ((!d && !b) || (d && b && Math.abs(d.cost - b.cost) < 1e-6)) agree++; else if (!mism) mism = { W: W, G: G, o: o, d: d, b: b };
}
ok("DP optimal = recherche exhaustive (" + tries + " cas, 3 formes, largeur max, pénalités)", agree === tries, mism);

// Cas concrets / concrete cases (largeurs = nombre de lettres, espace = 1)
function lens(str) { return str.split(" ").map(function (w) { return w.length; }); }
function ones(n) { var a = []; for (var i = 0; i < n; i++) a.push(1); return a; }
var words = "Le festival international du film de Marrakech".split(" ");
W = lens(words.join(" ")); G = ones(W.length - 1); sm = words.map(function (w) { return !!C.wordSet("le du de")[w.toLowerCase()]; });
var res = C.balance(W, G, sm, { k: 2, shape: "balanced", maxWidth: 0, avoidSmall: true, avoidSingle: true });
ok("titre 2 lignes équilibré", eq(res.breaks, [2]), res);
ok("irrégularité réduite (25 / 20)", eq(res.widths, [25, 20]), res.widths);
var py = C.balance(W, G, sm, { k: 3, shape: "pyramid", maxWidth: 0, avoidSmall: false, avoidSingle: false });
ok("pyramide : largeurs croissantes", py.widths[0] <= py.widths[1] && py.widths[1] <= py.widths[2], py.widths);
var inv = C.balance(W, G, sm, { k: 3, shape: "inverted", maxWidth: 0, avoidSmall: false, avoidSingle: false });
ok("pyramide inversée : largeurs décroissantes", inv.widths[0] >= inv.widths[1] && inv.widths[1] >= inv.widths[2], inv.widths);
var nos = C.balance(W, G, sm, { k: 2, shape: "balanced", maxWidth: 0, avoidSmall: true, avoidSingle: false });
ok("pas de ligne finissant par un petit mot", !sm[nos.breaks[0]], nos);
ok("largeur max impossible -> null", C.balance([50, 50, 50], [1, 1], [false, false, false], { k: 2, shape: "balanced", maxWidth: 60 }) === null);
ok("k > unités réduit", C.balance([5, 5], [1], [false, false], { k: 4, shape: "balanced", maxWidth: 0 }).widths.length === 2);
ok("une ligne", eq(C.balance([5, 5], [1], [false, false], { k: 1, shape: "balanced", maxWidth: 0 }).breaks, []));
ok("irrégularité 0 % / 50 %", C.uneven([10, 10]) === 0 && C.uneven([10, 5]) === 50);

// --- Modifications de texte / edits
var str = "Le festival international du film de Marrakech";
t = C.tokenize(str, {});
var out = C.applyToString(str, C.edits(str, t, [2]));
ok("retour forcé inséré à la place de l'espace", out === "Le festival international" + BR + "du film de Marrakech", out);
str = "Le festival" + BR + "international du film de Marrakech";
t = C.tokenize(str, {});
out = C.applyToString(str, C.edits(str, t, [2]));
ok("ancien retour retiré, nouveau posé", out === "Le festival international" + BR + "du film de Marrakech", out);
str = "Le  festival international";
t = C.tokenize(str, {});
out = C.applyToString(str, C.edits(str, t, [0]));
ok("double espace -> un seul retour", out === "Le" + BR + "festival international", out);
str = "porte-" + BR + "avions géant";
t = C.tokenize(str, {});
out = C.applyToString(str, C.edits(str, t, [1]));
ok("retour après trait d'union retiré sans espace", out === "porte-avions" + BR + "géant", out);
str = "porte-avions géant de la marine";
t = C.tokenize(str, { hyphen: true });
out = C.applyToString(str, C.edits(str, t, [0]));
ok("coupe insérée après trait d'union", out === "porte-" + BR + "avions géant de la marine", out);
str = "Bonjour" + BR + "monde";
t = C.tokenize(str, {});
ok("coupe déjà en place : aucune modification", C.edits(str, t, [0]).length === 0);
ok("aperçu", C.preview("Le film de nuit", C.tokenize("Le film de nuit", {}), [1]) === "Le film / de nuit");
t = C.tokenize("un deux trois quatre", {});
ok("coupes déduites des débuts de ligne", eq(C.breaksFromStarts(t, [8, 14]), [1, 2]));
ok("coupes br", eq(C.brBreaks(C.tokenize("a" + BR + "b c" + BR + "d", {})), [0, 2]));

console.log("\n" + pass + " ok, " + fail + " échec(s)");
process.exit(fail ? 1 : 0);
