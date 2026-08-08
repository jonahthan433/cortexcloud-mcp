p = "/opt/CortexCloudAPI/static/index.html"
s = open(p).read()
old = '''      return `<tr><td><span class="mdot"></span>${m}</td><td class="amt">${t.amount_usdc} USDC</td><td class="age">${fmtAge(t.age_s)}</td></tr>`;'''
new = '''      const age = (t.age_s != null) ? t.age_s : (Math.floor(Date.now()/1000) - (t.ts || 0));
      return `<tr><td><span class="mdot"></span>${m}</td><td class="amt">${t.amount_usdc} USDC</td><td class="age">${fmtAge(age)}</td></tr>`;'''
assert old in s, "js block not found"
s = s.replace(old, new, 1)
open(p, "w").write(s)
print("HTML_AGE_FIXED")
