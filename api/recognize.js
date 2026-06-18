// Fonction serverless Vercel — appelée par le bouton "Identifier par photo" du formulaire de déclaration.
// Reçoit une photo + la liste des références existantes, demande à Claude (vision) de suggérer
// les correspondances les plus probables, renvoie un JSON de suggestions.
// Nécessite la variable d'environnement ANTHROPIC_API_KEY configurée dans Vercel (Project Settings > Environment Variables).

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { photo, refs } = req.body || {};
    if (!photo || !refs || !Array.isArray(refs)) {
      return res.status(400).json({ error: 'photo et refs (tableau) sont requis' });
    }

    const match = photo.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Format de photo invalide (data URL attendue)' });
    }
    const mediaType = match[1];
    const base64Data = match[2];

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY non configurée sur Vercel' });
    }

    const refsList = refs.map(r => `${r.ref} — ${r.designation}`).join('\n');

    const prompt = `Voici une photo d'une pièce industrielle rebutée prise en atelier. Voici la liste des références disponibles (code — désignation) :

${refsList}

Identifie les 3 références les plus probables correspondant à la pièce visible sur la photo. Si un numéro ou code est visible gravé/imprimé sur la pièce, utilise-le en priorité pour le matching exact. Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte avant ou après, sans balises markdown, format exact :
[{"ref":"...","confidence":"haute","raison":"..."},{"ref":"...","confidence":"moyenne","raison":"..."}]`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64Data } },
            { type: 'text', text: prompt }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'Erreur API Anthropic: ' + errText });
    }

    const data = await response.json();
    const text = (data.content && data.content[0] && data.content[0].text) || '[]';
    const clean = text.replace(/```json|```/g, '').trim();

    let suggestions;
    try {
      suggestions = JSON.parse(clean);
    } catch (parseErr) {
      return res.status(502).json({ error: 'Réponse IA non parsable', raw: text });
    }

    return res.status(200).json({ suggestions });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
}
