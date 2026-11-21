import { atom, read, update } from 'claude-code'
import type { Register, StateDollar } from 'claude-code'

import type { Live, Mood } from '../types'

const PANE = 'alter'
const TITLE = 'Alter'

const live = atom({ plugin: 'alter', key: 'live' } as const, {
  mood: 'idle', activity: 'Prêt', log: [], last: '', experts: [], at: 0,
} as Live, { shape: 'live-2' })

// ---------- L'avatar, animé en SVG (SMIL) selon l'humeur ----------

function avatar(mood: Mood, size: number): string {
  const blink = `<animate attributeName="height" values="28;28;3;28" keyTimes="0;.93;.965;1" dur="4.6s" repeatCount="indefinite"/><animate attributeName="y" values="80;80;92.5;80" keyTimes="0;.93;.965;1" dur="4.6s" repeatCount="indefinite"/>`
  const look = mood === 'thinking' ? 'translate(5 -6)' : mood === 'working' ? 'translate(-5 5)' : 'translate(0 0)'
  const breathe = `<circle cx="100" cy="100" r="86" fill="none" stroke="#6CEDFF" stroke-width="1.3"><animate attributeName="opacity" values=".15;.45;.15" dur="5.5s" repeatCount="indefinite"/><animate attributeName="r" values="84;88;84" dur="5.5s" repeatCount="indefinite"/></circle>`
  const ripple = (delay: number) => `<circle cx="100" cy="100" r="76" fill="none" stroke="#6CEDFF" stroke-width="1.3" opacity="0"><animate attributeName="r" values="76;98" dur="2.4s" begin="${delay}s" repeatCount="indefinite"/><animate attributeName="opacity" values=".6;0" dur="2.4s" begin="${delay}s" repeatCount="indefinite"/></circle>`
  const orbit = (dur: number, op: number) => `<circle cx="100" cy="100" r="91" fill="none" stroke="#6CEDFF" stroke-width="2.6" stroke-linecap="round" stroke-dasharray="70 502" opacity="${op}"><animateTransform attributeName="transform" type="rotate" from="0 100 100" to="360 100 100" dur="${dur}s" repeatCount="indefinite"/></circle>`
  const halo = mood === 'idle' ? breathe : mood === 'speaking' ? ripple(0) + ripple(0.8) + ripple(1.6) : mood === 'thinking' ? orbit(1.5, 0.95) : orbit(3, 0.5)
  const mouth = mood === 'speaking'
    ? `<rect x="88" y="129" width="24" height="7" rx="3.5" fill="#CFF7FF"><animate attributeName="width" values="24;12;30;16;26;24" dur="0.9s" repeatCount="indefinite"/><animate attributeName="x" values="88;94;85;92;87;88" dur="0.9s" repeatCount="indefinite"/></rect>`
    : mood === 'thinking'
      ? `<rect x="94" y="131" width="12" height="5" rx="2.5" fill="#CFF7FF" opacity=".92"/>`
      : `<rect x="88" y="131" width="24" height="5" rx="2.5" fill="#CFF7FF" opacity=".92"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 212 212" width="${size}" height="${size}">
<title>Alter</title>
<style>.eyes{transition:transform .4s ease;transform-origin:100px 94px}svg:hover .eyes{transform:scale(1.12)}</style>
<defs><radialGradient id="f" cx="50%" cy="34%" r="70%"><stop offset="0" stop-color="#1046C0"/><stop offset=".55" stop-color="#062A7E"/><stop offset="1" stop-color="#021038"/></radialGradient>
<filter id="g" x="-100%" y="-60%" width="300%" height="220%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
${halo}
<circle cx="100" cy="100" r="76" fill="url(#f)"/>
<circle cx="100" cy="100" r="76" fill="none" stroke="#6CEDFF" stroke-opacity=".5" stroke-width="1.4"/>
<ellipse cx="82" cy="60" rx="40" ry="17" fill="#fff" opacity=".07"/>
<g transform="${look}"><g class="eyes">
<rect x="69" y="80" width="14" height="28" rx="7" fill="#E9FDFF" filter="url(#g)">${blink}</rect>
<rect x="117" y="80" width="14" height="28" rx="7" fill="#E9FDFF" filter="url(#g)">${blink}</rect>
</g></g>
${mouth}
</svg>`
}

// ---------- Ce qu'Alter fait, en français ----------

const MOOD_TXT: Record<Mood, string> = {
  idle: 'Prêt', thinking: 'Réfléchit…', working: 'Au travail…', speaking: 'Te répond',
}

function describeTool(tool: string): string {
  if (tool === 'Read') return 'Lit un fichier'
  if (tool === 'Edit' || tool === 'Write' || tool === 'NotebookEdit') return 'Rédige'
  if (tool === 'Bash') return 'Lance une commande'
  if (tool === 'Grep' || tool === 'Glob') return 'Cherche dans les fichiers'
  if (tool === 'WebSearch' || tool === 'WebFetch') return 'Arthur fait une recherche'
  if (tool === 'Agent' || tool === 'Workflow') return 'Envoie une équipe de terrain'
  if (tool.startsWith('Artifact')) return 'Consulte le QG'
  if (tool === 'Skill') return 'Prend un outil du Cabinet'
  if (tool === 'TodoWrite' || tool.startsWith('Task')) return 'Organise les tâches'
  if (tool.startsWith('mcp__Gmail')) return 'Regarde la messagerie'
  if (tool.startsWith('mcp__Google_Calendar')) return "Regarde l'agenda"
  if (tool.startsWith('mcp__')) return 'Interroge un service connecté'
  return 'Travaille'
}

const EXPERTS = [
  { id: 'victor', nom: 'Victor', pole: 'Stratégie' }, { id: 'helene', nom: 'Hélène', pole: 'Capital' },
  { id: 'marc', nom: 'Marc', pole: 'Finance' }, { id: 'ines', nom: 'Inès', pole: 'Growth' },
  { id: 'paul', nom: 'Paul', pole: 'Commerce' }, { id: 'claire', nom: 'Claire', pole: 'Coaching' },
  { id: 'thomas', nom: 'Thomas', pole: 'Organisation' }, { id: 'nadia', nom: 'Nadia', pole: 'Psychologie' },
  { id: 'keller', nom: 'Maître Keller', pole: 'Droit' }, { id: 'sophie', nom: 'Sophie', pole: 'Conformité' },
  { id: 'lea', nom: 'Léa', pole: 'Produit' }, { id: 'hugo', nom: 'Hugo', pole: 'IA' },
  { id: 'samir', nom: 'Samir', pole: 'Back-end' }, { id: 'julien', nom: 'Julien', pole: 'Web et mobile' },
  { id: 'chloe', nom: 'Chloé', pole: 'Design' }, { id: 'emma', nom: 'Emma', pole: 'Ergonomie' },
  { id: 'arthur', nom: 'Arthur', pole: 'Veille' }, { id: 'cassandre', nom: 'Cassandre', pole: 'Contradiction' },
] as const

function expertsIn(text: string): string[] {
  return EXPERTS.filter(x => text.includes(`**${x.nom}`) || text.includes(`**${x.nom.replace('Maître ', '')}`)).map(x => x.nom)
}

function excerpt(text: string): string {
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>|]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()

  return plain.length > 240 ? plain.slice(0, 237).trimEnd() + '…' : plain
}

function hhmm(ms: number): string {
  if (!ms) return ''
  const d = new Date(ms)

  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const QUICK = [
  { key: 'point', label: 'Point du jour', text: 'Alter, fais le point du jour : ce qui compte cette semaine, ce qui bloque, et ta recommandation.', send: true },
  { key: 'statuts', label: 'Revue des statuts', text: 'Alter, faisons la revue des statuts.', send: true },
  { key: 'priorites', label: 'Mes 3 priorités', text: 'Alter, aide-moi à fixer mes trois priorités des 30 prochains jours. Commence par les bonnes questions.', send: true },
  { key: 'cabinet', label: 'Réunir le Cabinet…', text: 'Alter, réunis le Cabinet sur : ', send: false },
  { key: 'diable', label: 'Avocat du diable…', text: 'Cassandre, attaque ce plan : ', send: false },
  { key: 'decision', label: 'Noter une décision…', text: 'Alter, note cette décision : ', send: false },
] as const

function setMood($: StateDollar, mood: Mood, activity: string, logIt = false) {
  return update($, live, cur => ({
    ...cur,
    mood,
    activity,
    log: logIt && cur.log[0] !== activity ? [activity, ...cur.log].slice(0, 4) : cur.log,
    at: Date.now(),
  }))
}

export const register: Register = (on, options) => {
  const qg = typeof options.qg_url === 'string' && options.qg_url.startsWith('https://') ? options.qg_url : ''
  let settle: { cancel: () => void } | undefined

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'alter', description: 'Ouvre le widget Alter à côté du chat' })
    void $.ui.open({ id: PANE, title: TITLE, placement: 'widget' })

    return next(e)
  })

  on('command.run', { command: 'alter' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Alter est là.' }
  })

  on('turn.start', async ($, e, next) => {
    if (e.agentId === undefined) {
      settle?.cancel()
      await update($, live, cur => ({ ...cur, log: [] }))
      await setMood($, 'thinking', 'Réfléchit…')
    }

    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    void setMood($, 'working', describeTool(String(e.tool)), true).catch(() => undefined)

    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)

    if (e.agentId === undefined) {
      const text = done.text ?? ''
      const mood: Mood = e.reason === 'answer' ? 'speaking' : 'idle'
      const activity = e.reason === 'answer' ? 'Te répond' : e.reason === 'aborted' ? 'Interrompu' : 'Un souci est survenu'
      await update($, live, cur => ({
        ...cur,
        mood,
        activity,
        last: text ? excerpt(text) : cur.last,
        experts: text ? expertsIn(text) : cur.experts,
        at: Date.now(),
      }))
      settle?.cancel()
      settle = $.clock.after(6000, () => {
        void update($, live, cur => (cur.mood === 'speaking' ? { ...cur, mood: 'idle' as const, activity: 'Prêt' } : cur))
      })
    }

    return done
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const table = $.ui.resolve(e)
    const { Box, Text, Button, Input, Link, Progress } = table
    const s = await read($, live)
    const isWidget = e.props.placement === 'widget'
    const busy = s.mood === 'thinking' || s.mood === 'working'

    const face = (size: number) =>
      'Svg' in table ? (
        <table.Svg source={avatar(s.mood, size)} alt={`Alter : ${MOOD_TXT[s.mood]}`} width={size} height={size} isInteractive />
      ) : (
        <Text color="#6CEDFF" bold>( ▮ ▮ )</Text>
      )

    const head = (size: number) => (
      <Box flexDirection="row" alignItems="center" gap={1}>
        {face(size)}
        <Box flexDirection="column" flexShrink={1}>
          <Text size="title" weight="semibold">{MOOD_TXT[s.mood]}</Text>
          <Text dimColor size="footnote" maxLines={1}>
            {busy ? s.activity : s.experts.length ? `Avec ${s.experts.join(', ')}` : 'Directeur de cabinet · 18 experts'}
          </Text>
        </Box>
      </Box>
    )

    // ---------- Petite carte (widget) : à lire d'un coup d'œil ----------
    if (isWidget) {
      return (
        <Box flexDirection="column" gap={1} padding={1}>
          {head(56)}
          {busy ? <Progress label={s.activity} /> : null}
          {s.last ? (
            <Text size="footnote" maxLines={3}>{s.last}</Text>
          ) : (
            <Text dimColor size="footnote">Pose ta question dans le chat : Alter réunit le bon expert.</Text>
          )}
          <Text dimColor size="caption">{s.at ? `Mis à jour à ${hhmm(s.at)}` : 'Agrandis la carte pour lui parler'}</Text>
        </Box>
      )
    }

    // ---------- Vue complète : on parle à Alter ----------
    return (
      <Box flexDirection="column" gap={1} padding={1}>
        <Box flexDirection="column" alignItems="center" gap={0}>
          {face(112)}
          <Text size="heading" weight="semibold">Alter</Text>
          <Text dimColor size="footnote">{busy ? s.activity : MOOD_TXT[s.mood]}</Text>
        </Box>

        {busy ? <Progress label={s.activity} /> : null}

        {s.log.length > 1 ? (
          <Box flexDirection="column">
            {s.log.slice(1).map(line => <Text dimColor size="caption">· {line}</Text>)}
          </Box>
        ) : null}

        <Input
          key="ask"
          label="Parle à Alter"
          placeholder="Écris ta question…"
          submitLabel="Envoyer"
          onSubmit={value => {
            const text = value.trim()
            if (text) void $.prompt.submit({ text, asUser: true })
          }}
        />

        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {QUICK.map(q => (
            <Button
              key={q.key}
              label={q.label}
              variant={q.send ? 'primary' : 'secondary'}
              onPress={async () => {
                if (q.send) {
                  await $.prompt.submit({ text: q.text, asUser: true })
                } else {
                  const r = await $.prompt.fill({ text: q.text, mode: 'replace' })
                  if (!r.isFilled) $.ui.toast(`À écrire : ${q.text}`)
                }
              }}
            />
          ))}
        </Box>

        {s.last ? (
          <Box flexDirection="column" borderStyle="round" borderColor="#6CEDFF" padding={1}>
            <Text size="caption" weight="semibold">Dernière réponse · {hhmm(s.at)}</Text>
            <Text size="footnote" maxLines={6}>{s.last}</Text>
          </Box>
        ) : null}

        <Box flexDirection="column">
          <Text weight="semibold">Le Cabinet</Text>
          <Text dimColor size="caption">Un clic pour interpeller un expert.</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {EXPERTS.map(x => (
              <Button
                key={x.id}
                plain
                dimColor={!s.experts.includes(x.nom)}
                onPress={async () => {
                  const r = await $.prompt.fill({ text: `${x.nom}, `, mode: 'replace' })
                  if (!r.isFilled) $.ui.toast(`À écrire : ${x.nom}, …`)
                }}
              >
                {x.nom} <Text dimColor>{x.pole}</Text>
              </Button>
            ))}
          </Box>
        </Box>

        {qg ? <Link href={qg} label="Ouvrir le QG" /> : null}
      </Box>
    )
  })
}
