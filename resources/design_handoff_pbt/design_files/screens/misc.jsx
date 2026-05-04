// PBT — History, Pet Analyzer, Resources, Settings

// ─────────────────────────────────────────────────────────────
// History
// ─────────────────────────────────────────────────────────────
function HistoryScreen({ onOpen, theme = 'light' }) {
  const dark = theme === 'dark';
  const groups = [
    { day: 'Today', items: [
      { id: 'a', title: 'Cost objection · Rx diet', breed: 'Lab, 7yr', score: 86, t: '14m' },
      { id: 'b', title: '"My breeder said…"', breed: 'GSD puppy, 4mo', score: 91, t: '2h' },
    ]},
    { day: 'This week', items: [
      { id: 'c', title: 'Grain-free pushback', breed: 'Golden, 3yr', score: 78, t: 'Mon' },
      { id: 'd', title: 'Switching brand resistance', breed: 'Mini Schnauzer, 5yr', score: 64, t: 'Sun' },
      { id: 'e', title: 'Senior-formula skeptic', breed: 'French Bulldog, 8yr', score: 82, t: 'Sat' },
    ]},
    { day: 'Earlier', items: [
      { id: 'f', title: 'Treats vs. weight management', breed: 'Pug, 6yr', score: 70, t: 'Apr 28' },
      { id: 'g', title: 'Anxious puppy parent', breed: 'Mixed, 9wk', score: 88, t: 'Apr 26' },
    ]},
  ];
  return (
    <Page theme={theme}>
      <TopBar theme={theme} title="History"
        trailing={<button style={iconBtn(dark)}><Icon.search/></button>}/>
      <div style={{ padding: '4px 22px 0' }}>
        <h1 style={{ fontFamily: 'var(--pbt-font)', fontSize: 32, lineHeight: 1.05, fontWeight: 400, margin: '0 0 4px', letterSpacing: '-0.025em', color: dark ? '#fff' : 'oklch(0.18 0.04 20)' }}>
          Every conversation,<br/>tracked and tagged.
        </h1>
        <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)', marginBottom: 22 }}>
          27 sessions · 81% avg score
        </div>

        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', marginBottom: 16, paddingBottom: 4 }} className="pbt-scroll">
          {['All', 'Cost', 'Trend beliefs', 'Breeder advice', 'Rx diets', 'Brand switch'].map((f, i) => (
            <Chip key={f} active={i === 0}>{f}</Chip>
          ))}
        </div>

        {groups.map(g => (
          <div key={g.day} style={{ marginBottom: 16 }}>
            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)', marginBottom: 10 }}>{g.day}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {g.items.map(r => (
                <Glass key={r.id} radius={18} blur={28} padding={14} theme={theme} onClick={() => onOpen && onOpen(r)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{ width: 40, height: 40, borderRadius: 12, flexShrink: 0,
                      background: 'linear-gradient(135deg, oklch(0.78 0.18 32 / 0.4), oklch(0.55 0.24 18 / 0.3))',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'oklch(0.55 0.24 18)',
                      border: '0.5px solid rgba(255,255,255,0.7)' }}><Icon.chat/></div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                      <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 11, color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.50 0.04 20)' }}>{r.breed} · {r.t}</div>
                    </div>
                    <ScoreChip score={r.score} dark={dark}/>
                  </div>
                </Glass>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// Pet Analyzer — body condition score + muscle score + calories
// ─────────────────────────────────────────────────────────────

// Calorie table from WSAVA (active adult) — kg : [low, high] kcal/day
const CAL_TABLE = [
  [2,140,177],[3,190,239],[4,240,297],[5,280,351],[6,320,403],[7,360,452],
  [8,400,499],[9,440,546],[10,470,590],[11,510,634],[12,540,677],[13,580,719],
  [14,610,760],[15,640,800],[16,670,840],[17,700,879],[18,730,918],[19,760,956],
  [20,790,993],[21,820,1030],[22,850,1067],[23,880,1103],[24,910,1139],[25,940,1174],
  [26,970,1209],[27,1000,1244],[28,1020,1278],[29,1050,1312],[30,1080,1346],
  [31,1100,1397],[32,1130,1413],[33,1160,1446],[34,1180,1478],[35,1210,1511],
  [36,1240,1543],[37,1260,1575],[38,1290,1607],[39,1310,1639],[40,1340,1670],
  [41,1360,1701],[42,1390,1732],[43,1410,1763],[44,1440,1794],[45,1460,1824],
  [46,1480,1855],[47,1510,1885],[48,1530,1915],[49,1560,1945],
];

const BCS_LEVELS = [
  { score: 1, band: 'Under',  label: 'Severely underweight', desc: 'Ribs, lumbar vertebrae, pelvic bones and all bony prominences evident from a distance. No discernible body fat. Obvious loss of muscle mass.', color: 'oklch(0.72 0.14 235)' },
  { score: 2, band: 'Under',  label: 'Underweight', desc: 'Ribs, lumbar vertebrae and pelvic bones easily visible. No palpable fat. Some evidence of other bony prominences. Minimal loss of muscle mass.', color: 'oklch(0.74 0.14 235)' },
  { score: 3, band: 'Under',  label: 'Thin',  desc: 'Ribs easily palpated and may be visible with no palpable fat. Tops of lumbar vertebrae visible. Pelvic bones becoming prominent. Obvious waist and abdominal tuck.', color: 'oklch(0.78 0.12 235)' },
  { score: 4, band: 'Ideal',  label: 'Lean ideal', desc: 'Ribs easily palpable, with minimal fat covering. Waist easily noted, viewed from above. Abdominal tuck evident.', color: 'oklch(0.70 0.18 145)' },
  { score: 5, band: 'Ideal',  label: 'Ideal', desc: 'Ribs palpable without excess fat covering. Waist observed behind ribs when viewed from above. Abdomen tucked up when viewed from side.', color: 'oklch(0.62 0.20 145)' },
  { score: 6, band: 'Ideal',  label: 'Above ideal', desc: 'Ribs palpable with slight excess fat covering. Waist is discernible viewed from above but is not prominent. Abdominal tuck apparent.', color: 'oklch(0.78 0.16 95)' },
  { score: 7, band: 'Over',   label: 'Overweight', desc: 'Ribs palpable with difficulty; heavy fat cover. Noticeable fat deposits over lumbar area and base of tail. Waist absent or barely visible. Abdominal tuck may be present.', color: 'oklch(0.78 0.16 70)' },
  { score: 8, band: 'Over',   label: 'Obese', desc: 'Ribs not palpable under very heavy fat cover, or palpable only with significant pressure. Heavy fat deposits over lumbar area and base of tail. Waist absent. No abdominal tuck.', color: 'oklch(0.66 0.20 35)' },
  { score: 9, band: 'Over',   label: 'Severely obese', desc: 'Massive fat deposits over thorax, spine and base of tail. Waist and abdominal tuck absent. Fat deposits on neck and limbs. Obvious abdominal distention.', color: 'oklch(0.55 0.24 18)' },
];

const MCS_LEVELS = [
  { id: 'normal',   label: 'Normal muscle mass', desc: 'No detectable wasting on palpation of spine, scapulae, skull, or wings of ilia.', color: 'oklch(0.62 0.20 145)' },
  { id: 'mild',     label: 'Mild loss',          desc: 'Slight reduction in epaxial muscle along the spine. Often missed without palpation.', color: 'oklch(0.78 0.16 95)' },
  { id: 'moderate', label: 'Moderate loss',      desc: 'Clear reduction at spine plus secondary sites. Visible to the trained eye.', color: 'oklch(0.78 0.16 70)' },
  { id: 'severe',   label: 'Severe loss',        desc: 'Profound wasting across multiple sites. Significant clinical concern.', color: 'oklch(0.55 0.24 18)' },
];

function calorieFor(kg) {
  // active adult formula: 130 * kg^0.75
  if (!kg || kg <= 0) return null;
  const active = Math.round(130 * Math.pow(kg, 0.75));
  const inactive = Math.round(95 * Math.pow(kg, 0.75));
  return { inactive, active };
}

function PetAnalyzerScreen({ onBack, theme = 'light' }) {
  const dark = theme === 'dark';
  const [name, setName] = useState('Tilly');
  const [breed, setBreed] = useState('Labrador Retriever, 7yr');
  const [weight, setWeight] = useState(28); // kg
  const [bcs, setBcs] = useState(7);
  const [mcs, setMcs] = useState('mild');
  const [activity, setActivity] = useState('active'); // active | inactive

  const cal = calorieFor(weight);
  const target = activity === 'active' ? cal?.active : cal?.inactive;
  const bcsLevel = BCS_LEVELS.find(b => b.score === bcs);
  const mcsLevel = MCS_LEVELS.find(m => m.id === mcs);

  const verdict = (() => {
    if (!bcsLevel) return null;
    if (bcsLevel.band === 'Ideal' && mcs === 'normal') return { tone: 'good',  text: 'Ideal range across body and muscle. Lock in current plan.' };
    if (bcsLevel.band === 'Over')  return { tone: 'warn',  text: 'Body condition above ideal. Recommend a measured caloric deficit and re-weigh in 4 weeks.' };
    if (bcsLevel.band === 'Under') return { tone: 'warn',  text: 'Below ideal body condition. Rule out medical causes; consider nutrient-dense calorie increase.' };
    if (mcs !== 'normal')           return { tone: 'warn', text: 'Muscle loss detected — assess regardless of body condition. Geriatric or chronic disease screen recommended.' };
    return { tone: 'ok', text: 'Mostly on track. Minor coaching opportunity.' };
  })();

  return (
    <Page theme={theme} padBottom={32}>
      <TopBar theme={theme} title="Pet Analyzer" onBack={onBack}
        trailing={<button style={iconBtn(dark)}><Icon.search/></button>}/>

      <div style={{ padding: '4px 22px 0' }}>
        <h1 style={{ fontFamily: 'var(--pbt-font)', fontSize: 32, lineHeight: 1.05, fontWeight: 400, margin: '0 0 6px', letterSpacing: '-0.025em', color: dark ? '#fff' : 'oklch(0.18 0.04 20)' }}>
          Read the room,<br/>read the dog.
        </h1>
        <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)', marginBottom: 18, lineHeight: 1.5, textWrap: 'pretty' }}>
          Plug in body and muscle scores plus weight, and we'll surface the WSAVA-grounded talking points to bring into the room.
        </div>

        {/* Pet header card */}
        <Glass radius={22} blur={28} padding={18} theme={theme} style={{ marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -24, right: -24, width: 140, height: 140, borderRadius: '50%',
            background: 'radial-gradient(closest-side, oklch(0.78 0.18 32 / 0.5), transparent 70%)', filter: 'blur(8px)' }}/>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 18,
              background: 'linear-gradient(135deg, oklch(0.78 0.18 32), oklch(0.55 0.24 18))',
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset' }}>
              <Icon.paw/>
            </div>
            <div style={{ flex: 1 }}>
              <input value={name} onChange={(e) => setName(e.target.value)} style={{
                width: '100%', border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--pbt-font)', fontSize: 22, fontWeight: 400,
                color: dark ? '#fff' : 'oklch(0.18 0.04 20)', letterSpacing: '-0.02em', padding: 0,
              }}/>
              <input value={breed} onChange={(e) => setBreed(e.target.value)} style={{
                width: '100%', border: 'none', outline: 'none', background: 'transparent',
                fontFamily: 'var(--pbt-font)', fontSize: 12,
                color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)', padding: 0,
              }}/>
            </div>
          </div>
        </Glass>

        {/* Weight + activity */}
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)', margin: '6px 0 10px', paddingLeft: 4 }}>
          Weight & activity
        </div>
        <Glass radius={20} blur={28} padding={18} theme={theme} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <span style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 500, color: dark ? '#fff' : 'oklch(0.22 0.04 20)' }}>
              Weight
            </span>
            <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 18, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)' }}>
              {weight} kg <span style={{ fontSize: 11, color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)' }}>· {(weight * 2.205).toFixed(1)} lb</span>
            </span>
          </div>
          <input type="range" min="2" max="49" step="1" value={weight}
            onChange={(e) => setWeight(parseInt(e.target.value))}
            style={{
              width: '100%', accentColor: 'oklch(0.55 0.24 18)',
              height: 4, marginBottom: 14, marginTop: 4,
            }}/>
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { id: 'active',   label: 'Active', sub: '130 × kg⁰·⁷⁵' },
              { id: 'inactive', label: 'Inactive / senior', sub: '95 × kg⁰·⁷⁵' },
            ].map(opt => {
              const isActive = activity === opt.id;
              return (
                <button key={opt.id} onClick={() => setActivity(opt.id)} style={{
                  flex: 1, padding: '10px 12px', borderRadius: 14,
                  border: isActive ? '1px solid oklch(0.55 0.24 18)' : '0.5px solid rgba(255,255,255,0.6)',
                  background: isActive ? 'oklch(0.55 0.24 18 / 0.1)' : 'rgba(255,255,255,0.45)',
                  cursor: 'pointer', textAlign: 'left',
                  boxShadow: isActive ? '0 0 0 3px oklch(0.55 0.24 18 / 0.12)' : 'none',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 600, color: isActive ? 'oklch(0.45 0.20 18)' : (dark ? '#fff' : 'oklch(0.22 0.04 20)') }}>
                    {opt.label}
                  </div>
                  <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)' }}>
                    {opt.sub}
                  </div>
                </button>
              );
            })}
          </div>
        </Glass>

        {/* Body Condition Score 1-9 */}
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)', margin: '14px 0 10px', paddingLeft: 4 }}>
          Body condition score · WSAVA 1–9
        </div>
        <Glass radius={20} blur={28} padding={16} theme={theme} style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
            {BCS_LEVELS.map(lvl => {
              const isActive = lvl.score === bcs;
              return (
                <button key={lvl.score} onClick={() => setBcs(lvl.score)} style={{
                  flex: 1, height: 44, borderRadius: 12, border: 'none',
                  background: isActive
                    ? `linear-gradient(180deg, ${lvl.color}, color-mix(in oklab, ${lvl.color} 80%, black))`
                    : (dark ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.55)'),
                  color: isActive ? '#fff' : (dark ? 'rgba(255,255,255,0.7)' : 'oklch(0.30 0.06 20)'),
                  fontFamily: 'Geist Mono, monospace', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: isActive ? `0 4px 12px -2px ${lvl.color}` : 'none',
                  transition: 'all 0.15s',
                }}>
                  {lvl.score}
                </button>
              );
            })}
          </div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', fontFamily: 'Geist Mono, monospace',
            fontSize: 9, color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)',
            letterSpacing: '0.1em', marginBottom: 14, padding: '0 4px',
          }}>
            <span>UNDER</span><span>IDEAL</span><span>OVER</span>
          </div>
          <div style={{
            padding: 14, borderRadius: 14,
            background: `${bcsLevel.color.replace(')', ' / 0.12)')}`,
            border: `0.5px solid ${bcsLevel.color}`,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
              <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', color: bcsLevel.color }}>
                {bcsLevel.score}/9
              </span>
              <span style={{ fontFamily: 'var(--pbt-font)', fontSize: 14, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)' }}>
                {bcsLevel.label}
              </span>
            </div>
            <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12.5, lineHeight: 1.5,
              color: dark ? 'rgba(255,255,255,0.75)' : 'oklch(0.30 0.04 20)', textWrap: 'pretty' }}>
              {bcsLevel.desc}
            </div>
          </div>
        </Glass>

        {/* Muscle Condition */}
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)', margin: '14px 0 10px', paddingLeft: 4 }}>
          Muscle condition score
        </div>
        <Glass radius={20} blur={28} padding={14} theme={theme} style={{ marginBottom: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {MCS_LEVELS.map(lvl => {
              const isActive = lvl.id === mcs;
              return (
                <button key={lvl.id} onClick={() => setMcs(lvl.id)} style={{
                  padding: '12px 14px', borderRadius: 14, textAlign: 'left',
                  border: isActive ? `1px solid ${lvl.color}` : '0.5px solid rgba(255,255,255,0.6)',
                  background: isActive ? `${lvl.color.replace(')', ' / 0.12)')}` : 'rgba(255,255,255,0.4)',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 5, background: lvl.color }}/>
                    <span style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.22 0.04 20)' }}>
                      {lvl.label}
                    </span>
                  </div>
                  <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 11, lineHeight: 1.4, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)' }}>
                    {lvl.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </Glass>

        {/* Result */}
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)', margin: '14px 0 10px', paddingLeft: 4 }}>
          Calorie target & verdict
        </div>
        <Glass radius={22} blur={28} padding={20} theme={theme} style={{ marginBottom: 14, position: 'relative', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%',
            background: `radial-gradient(closest-side, ${verdict?.tone === 'good' ? 'oklch(0.70 0.18 145 / 0.5)' : verdict?.tone === 'warn' ? 'oklch(0.66 0.20 35 / 0.5)' : 'oklch(0.78 0.18 95 / 0.5)'}, transparent 70%)`,
            filter: 'blur(8px)' }}/>
          <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)', marginBottom: 4 }}>
                  {activity === 'active' ? 'Active adult' : 'Inactive / senior'}
                </div>
                <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 38, lineHeight: 1, color: dark ? '#fff' : 'oklch(0.18 0.04 20)' }}>
                  {target} <span style={{ fontFamily: 'Geist Mono, monospace', fontSize: 14, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.50 0.04 20)' }}>kcal/day</span>
                </div>
              </div>
              <div style={{
                padding: '6px 10px', borderRadius: 999,
                background: dark ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.38)',
                fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.1em', color: bcsLevel.color,
                border: `0.5px solid ${bcsLevel.color}`,
              }}>
                BCS {bcsLevel.score}/9
              </div>
            </div>
            {verdict && (
              <div style={{
                padding: 14, borderRadius: 14,
                background: verdict.tone === 'good'
                  ? 'oklch(0.70 0.18 145 / 0.12)'
                  : verdict.tone === 'warn'
                  ? 'oklch(0.66 0.20 35 / 0.12)'
                  : 'oklch(0.78 0.18 95 / 0.12)',
                border: `0.5px solid ${verdict.tone === 'good' ? 'oklch(0.55 0.18 145)' : verdict.tone === 'warn' ? 'oklch(0.55 0.22 22)' : 'oklch(0.65 0.16 80)'}`,
              }}>
                <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase',
                  color: verdict.tone === 'good' ? 'oklch(0.45 0.20 145)' : verdict.tone === 'warn' ? 'oklch(0.45 0.22 22)' : 'oklch(0.50 0.18 80)', marginBottom: 4 }}>
                  {verdict.tone === 'good' ? 'On track' : verdict.tone === 'warn' ? 'Coaching opportunity' : 'Keep watching'}
                </div>
                <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13.5, lineHeight: 1.5, color: dark ? 'rgba(255,255,255,0.85)' : 'oklch(0.25 0.04 20)', textWrap: 'pretty' }}>
                  {verdict.text}
                </div>
              </div>
            )}
          </div>
        </Glass>

        {/* Pull-from-table card */}
        <Glass radius={18} blur={28} padding={14} theme={theme} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Icon.book/>
            <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.22 0.04 20)' }}>
              From the WSAVA reference table
            </div>
          </div>
          {(() => {
            const row = CAL_TABLE.find(r => r[0] === weight) || CAL_TABLE.reduce((p, c) => Math.abs(c[0] - weight) < Math.abs(p[0] - weight) ? c : p, CAL_TABLE[0]);
            return (
              <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 12, color: dark ? 'rgba(255,255,255,0.7)' : 'oklch(0.40 0.04 20)' }}>
                {row[0]} kg → <span style={{ color: dark ? '#fff' : 'oklch(0.20 0.04 20)', fontWeight: 600 }}>{row[1]}–{row[2]} kcal/day</span> for an ideal-condition adult.
              </div>
            );
          })()}
        </Glass>
        <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9.5, color: dark ? 'rgba(255,255,255,0.4)' : 'oklch(0.55 0.04 20)', lineHeight: 1.5, padding: '0 4px', marginBottom: 8 }}>
          REFERENCE · 2006 NRC DAILY MAINTENANCE ENERGY REQUIREMENTS · WSAVA NUTRITION TOOLKIT 2020
        </div>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// Resources / Library
// ─────────────────────────────────────────────────────────────
function ResourcesScreen({ onBack, theme = 'light' }) {
  const dark = theme === 'dark';
  const [open, setOpen] = useState(null);

  const sections = [
    {
      id: 'nutrition',
      title: 'Nutrition assessment',
      eyebrow: 'WSAVA core',
      summary: 'The five-step nutritional assessment every visit — weight, BCS, MCS, diet history, environmental factors.',
      color: 'oklch(0.70 0.18 145)',
      driver: 'Harmonizer',
      content: [
        ['Why every visit?',     'Nutrition is a vital sign. WSAVA recommends BCS + MCS at every wellness check, not just at intake.'],
        ['The five-step screen', 'Diet · Feeding management · Animal · Environment · Body & muscle condition.'],
        ['When to escalate',     'Significant weight change, BCS shift ≥1, or muscle wasting → in-depth assessment.'],
      ],
    },
    {
      id: 'bcs',
      title: 'Body condition score',
      eyebrow: '1–9 scale',
      summary: 'Visual + palpation-based score. 4–5 is ideal; each step ≈ 10–15% body fat shift.',
      color: 'oklch(0.78 0.16 70)',
      driver: 'Energizer',
      content: [
        ['What you assess',    'Ribs, lumbar vertebrae, pelvic bones, abdominal tuck, waist (top-down).'],
        ['1–3 · Under',        'Ribs & vertebrae visible from a distance. Minimal-to-no fat. Often muscle loss too.'],
        ['4–5 · Ideal',        'Ribs palpable with light fat covering. Visible waist. Tucked abdomen.'],
        ['6–7 · Over',         'Ribs hard to feel. Waist fading. Fat over lumbar area and tail base.'],
        ['8–9 · Obese',        'Ribs not palpable. No waist. Heavy fat deposits across body.'],
      ],
    },
    {
      id: 'mcs',
      title: 'Muscle condition score',
      eyebrow: 'Independent of BCS',
      summary: 'Palpate spine, scapulae, skull, and ilium wings. Animals can be overweight AND have muscle loss.',
      color: 'oklch(0.72 0.14 235)',
      driver: 'Analyzer',
      content: [
        ['Where to feel',     'Epaxial muscles along the spine first — then scapulae, skull, wings of ilia.'],
        ['Normal',            'No detectable wasting. Good fill at every site.'],
        ['Mild loss',         'Slight reduction at the spine. Easy to miss without hands-on.'],
        ['Moderate loss',     'Visible reduction at multiple sites — caregivers may notice now.'],
        ['Severe loss',       'Profound wasting; significant clinical concern. Investigate cause.'],
      ],
    },
    {
      id: 'calories',
      title: 'Calorie targets',
      eyebrow: 'Active adult formula',
      summary: '130 × kg^0.75 for active adults; 95 × kg^0.75 for sedentary or senior. Individual variation is real.',
      color: 'oklch(0.55 0.24 18)',
      driver: 'Activator',
      content: [
        ['The formula',           '2006 NRC Daily Maintenance Energy Requirement, adjusted for activity level.'],
        ['Active adult',          '130 kcal × body weight (kg)^0.75 per day.'],
        ['Inactive / senior',     '95 kcal × body weight (kg)^0.75 per day.'],
        ['Use it as a starting line, not a finish line', 'Recheck weight in 4 weeks; adjust by ±10% as needed.'],
      ],
    },
  ];

  return (
    <Page theme={theme}>
      <TopBar theme={theme} title="Library" trailing={<button style={iconBtn(dark)}><Icon.search/></button>}/>

      <div style={{ padding: '4px 22px 0' }}>
        <h1 style={{ fontFamily: 'var(--pbt-font)', fontSize: 32, lineHeight: 1.05, fontWeight: 400, margin: '0 0 4px', letterSpacing: '-0.025em', color: dark ? '#fff' : 'oklch(0.18 0.04 20)' }}>
          The clinical<br/>backstop.
        </h1>
        <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)', marginBottom: 22, textWrap: 'pretty' }}>
          Quick-reference WSAVA nutrition assessment, scoring charts, and the science your scenarios pull from.
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sections.map(s => {
            const isOpen = open === s.id;
            return (
              <Glass key={s.id} radius={22} blur={28} padding={0} theme={theme} glow={s.color}
                style={{ position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', inset: 0,
                  opacity: 0.45, mixBlendMode: dark ? 'screen' : 'multiply',
                  pointerEvents: 'none',
                }}>
                  <DriverWave driver={s.driver} height={120} width={400} amplitude={0.9} speed={0.7} theme={theme}/>
                </div>
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setOpen(isOpen ? null : s.id)} style={{
                    width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
                    padding: 18, cursor: 'pointer',
                  }}>
                    <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: s.color, marginBottom: 6 }}>
                      {s.eyebrow}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                      <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 22, fontWeight: 400, lineHeight: 1.1, letterSpacing: '-0.02em', color: dark ? '#fff' : 'oklch(0.18 0.04 20)' }}>
                        {s.title}
                      </div>
                      <span style={{ color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)', flexShrink: 0, transform: isOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 0.2s' }}>
                        <Icon.arrow/>
                      </span>
                    </div>
                    <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12.5, lineHeight: 1.5, color: dark ? 'rgba(255,255,255,0.7)' : 'oklch(0.40 0.04 20)', marginTop: 6, textWrap: 'pretty' }}>
                      {s.summary}
                    </div>
                  </button>
                  {isOpen && (
                    <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 10, animation: 'pbtFadeUp 0.3s ease' }}>
                      {s.content.map(([k, v], i) => (
                        <div key={i} style={{
                          padding: 14, borderRadius: 14,
                          background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.32)',
                          border: '0.5px solid rgba(255,255,255,0.85)',
                        }}>
                          <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12.5, fontWeight: 600, color: dark ? '#fff' : 'oklch(0.20 0.04 20)', marginBottom: 4 }}>
                            {k}
                          </div>
                          <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12.5, lineHeight: 1.5, color: dark ? 'rgba(255,255,255,0.7)' : 'oklch(0.35 0.04 20)', textWrap: 'pretty' }}>
                            {v}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </Glass>
            );
          })}
        </div>

        <div style={{ marginTop: 24, marginBottom: 12, padding: 14, borderRadius: 16,
          background: dark ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.4)',
          border: '0.5px solid rgba(255,255,255,0.6)' }}>
          <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 9.5, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.5)' : 'oklch(0.50 0.04 20)', marginBottom: 6 }}>
            Sources
          </div>
          <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 11.5, lineHeight: 1.55, color: dark ? 'rgba(255,255,255,0.65)' : 'oklch(0.40 0.04 20)' }}>
            WSAVA Global Nutrition Toolkit · Body & Muscle Condition Scoring Charts (2020) · Tufts Univ. MCS chart (2013) · 2006 NRC Daily Maintenance Energy Requirement.
          </div>
        </div>
      </div>
    </Page>
  );
}

// ─────────────────────────────────────────────────────────────
// Settings
// ─────────────────────────────────────────────────────────────
function SettingsScreen({ profile, onRetake, theme = 'light' }) {
  const dark = theme === 'dark';
  const primary = ECHO_DRIVERS[profile?.primary || 'Activator'];

  const settingsGroups = [
    { label: 'Account',  items: [['Email', 'sam@brookline.vet'], ['Clinic', 'Brookline Animal Hospital'], ['Role', 'Lead vet tech']] },
    { label: 'Practice', items: [['Notifications', 'Daily streak'], ['Voice mode default', 'Off'], ['Difficulty floor', 'Skeptical']] },
    { label: 'About',    items: [['Retake ECHO Quiz', '→', onRetake], ['Coaching style', 'Warm & encouraging'], ['Data & privacy', '→']] },
  ];

  return (
    <Page theme={theme}>
      <TopBar theme={theme} title="You"/>
      <div style={{ padding: '4px 22px 0' }}>
        <Glass radius={24} blur={28} padding={0} theme={theme} glow={primary.color}
          style={{ marginBottom: 16, position: 'relative', overflow: 'hidden' }}>
          <div style={{
            position: 'absolute', inset: 0,
            opacity: 0.55, mixBlendMode: dark ? 'screen' : 'multiply',
            pointerEvents: 'none',
          }}>
            <DriverWave driver={primary.key} height={150} width={400} amplitude={1} speed={0.8} theme={theme}/>
          </div>
          <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%',
            background: `radial-gradient(closest-side, ${primary.color}, transparent 70%)`, opacity: 0.4, filter: 'blur(8px)' }}/>
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, padding: 20 }}>
            <div style={{
              width: 64, height: 64, borderRadius: 32,
              background: 'linear-gradient(135deg, oklch(0.78 0.18 32), oklch(0.55 0.24 18))',
              color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--pbt-font)', fontWeight: 600, fontSize: 22,
              boxShadow: '0 1px 0 rgba(255,255,255,0.4) inset',
            }}>SR</div>
            <div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 26, lineHeight: 1.05, color: dark ? '#fff' : 'oklch(0.18 0.04 20)' }}>Sam Rivera</div>
              <div style={{ fontFamily: 'var(--pbt-font)', fontSize: 12, color: dark ? 'rgba(255,255,255,0.6)' : 'oklch(0.45 0.04 20)' }}>Tech · Brookline Animal Hospital</div>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 6,
                fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600,
                letterSpacing: '0.14em', textTransform: 'uppercase', color: primary.accent,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: 4, background: primary.color, boxShadow: `0 0 6px ${primary.color}` }}/>
                The {primary.name}
              </div>
            </div>
          </div>
        </Glass>

        {settingsGroups.map(g => (
          <div key={g.label} style={{ marginBottom: 14 }}>
            <div style={{ fontFamily: 'Geist Mono, monospace', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: dark ? 'rgba(255,255,255,0.45)' : 'oklch(0.50 0.04 20)', marginBottom: 8, paddingLeft: 4 }}>{g.label}</div>
            <Glass radius={20} blur={28} padding={0} theme={theme}>
              {g.items.map(([k, v, action], i) => (
                <button key={k} onClick={action} style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  width: '100%', padding: '14px 16px', textAlign: 'left',
                  borderTop: i ? '0.5px solid rgba(255,255,255,0.5)' : 'none',
                  border: 'none', background: 'transparent',
                  cursor: action ? 'pointer' : 'default',
                }}>
                  <span style={{ fontFamily: 'var(--pbt-font)', fontSize: 14, color: dark ? '#fff' : 'oklch(0.22 0.04 20)' }}>{k}</span>
                  <span style={{ fontFamily: 'var(--pbt-font)', fontSize: 13, color: dark ? 'rgba(255,255,255,0.55)' : 'oklch(0.45 0.04 20)' }}>{v}</span>
                </button>
              ))}
            </Glass>
          </div>
        ))}
      </div>
    </Page>
  );
}

Object.assign(window, { HistoryScreen, PetAnalyzerScreen, ResourcesScreen, SettingsScreen });
