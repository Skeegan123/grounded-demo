import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { expect, test } from 'vitest'

const skillUrl = '/.well-known/agent-skills/use-grounded/SKILL.md'

test('publishes the Grounded workflow skill with a verified discovery entry', async () => {
  const publicDirectory = resolve(process.cwd(), 'public')
  const skill = await readFile(resolve(publicDirectory, skillUrl.slice(1)), 'utf8')
  const index = JSON.parse(await readFile(
    resolve(publicDirectory, '.well-known/agent-skills/index.json'),
    'utf8',
  )) as {
    skills: Array<{
      name: string
      type: string
      description: string
      url: string
      digest: string
    }>
  }
  const headers = await readFile(resolve(publicDirectory, '_headers'), 'utf8')
  const entry = index.skills.find(({ name }) => name === 'use-grounded')
  const normalizedSkill = skill.replace(/\s+/g, ' ')

  expect(skill).toContain('name: use-grounded')
  expect(normalizedSkill).toContain('Navigation alone is not visual inspection.')
  expect(normalizedSkill).toContain('no more than two minutes per batch')
  expect(entry).toEqual({
    name: 'use-grounded',
    type: 'skill-md',
    description:
      'Use Grounded WebMCP to investigate construction questions across Project Documents, inspect visual content, and collaborate with a Human Reviewer when professional judgment is needed.',
    url: skillUrl,
    digest: `sha256:${createHash('sha256').update(skill).digest('hex')}`,
  })
  expect(headers).toContain(skillUrl)
  expect(headers).toContain('Content-Type: text/markdown; charset=utf-8')
})
