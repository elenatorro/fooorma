import { supabase } from './auth.svelte'

const MAX_PROJECTS = 20
const SHARED_BUCKET = 'shared'

/** Strip path traversal characters to prevent accessing files outside the user's folder */
function sanitizeName(name: string): string {
  return name.replace(/\.\./g, '').replace(/[/\\]/g, '').trim()
}

export interface CloudFile {
  name: string
  updated_at: string
  thumbUrl?: string
}

export function createCloudStore(userId: string) {
  let files = $state<CloudFile[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)

  const bucket = 'projects'
  const folder = userId

  function thumbPath(oooName: string): string {
    return `${folder}/${oooName.replace(/\.ooo$/, '.thumb.png')}`
  }

  function sharedPath(oooName: string): string {
    return `${folder}/${oooName}`
  }

  function slugFromName(oooName: string): string {
    return oooName.replace(/\.ooo$/, '')
  }

  async function listProjects() {
    if (!supabase) return
    loading = true
    error = null
    const { data, error: err } = await supabase.storage.from(bucket).list(folder, {
      sortBy: { column: 'updated_at', order: 'desc' },
    })
    if (err) {
      error = err.message
    } else {
      const oooFiles = (data ?? []).filter(f => f.name.endsWith('.ooo'))
      files = oooFiles.map(f => ({
        name: f.name,
        updated_at: f.updated_at ?? '',
        thumbUrl: undefined,
      }))
      // Load signed URLs for thumbnails
      // List all files to find which thumb format exists (.png or legacy .webp)
      const { data: allFiles } = await supabase!.storage.from(bucket).list(folder)
      if (allFiles) {
        const fileNames = new Set(allFiles.map(f => f.name))
        for (let i = 0; i < files.length; i++) {
          const base = files[i].name.replace(/\.ooo$/, '')
          const thumbFile = fileNames.has(`${base}.thumb.png`) ? `${base}.thumb.png`
            : fileNames.has(`${base}.thumb.webp`) ? `${base}.thumb.webp`
            : null
          if (thumbFile) {
            const { data: signedData } = await supabase!.storage.from(bucket).createSignedUrl(`${folder}/${thumbFile}`, 3600)
            if (signedData?.signedUrl) {
              files[i] = { ...files[i], thumbUrl: signedData.signedUrl }
            }
          }
        }
      }
    }
    loading = false
  }

  async function saveProject(name: string, content: string, thumbnail?: Blob) {
    if (!supabase) return
    name = sanitizeName(name)
    loading = true
    error = null
    const fileName = name.endsWith('.ooo') ? name : `${name}.ooo`
    const path = `${folder}/${fileName}`

    // Check limit (allow overwrite of existing file)
    const isNew = !files.some(f => f.name === fileName)
    if (isNew && files.length >= MAX_PROJECTS) {
      error = `Maximum ${MAX_PROJECTS} projects reached. Delete a project first.`
      loading = false
      return
    }

    const blob = new Blob([content], { type: 'text/plain' })
    const { error: err } = await supabase.storage.from(bucket).upload(path, blob, { upsert: true })
    if (err) {
      error = err.message
      loading = false
      return
    }

    // Upload thumbnail
    if (thumbnail) {
      const tp = thumbPath(fileName)
      await supabase.storage.from(bucket).upload(tp, thumbnail, {
        upsert: true,
        contentType: 'image/png',
      })
    }

    await listProjects()
    loading = false
  }

  async function loadProject(name: string): Promise<string | null> {
    if (!supabase) return null
    name = sanitizeName(name)
    loading = true
    error = null
    const path = `${folder}/${name}`
    const { data, error: err } = await supabase.storage.from(bucket).download(path)
    loading = false
    if (err) {
      error = err.message
      return null
    }
    return await data!.text()
  }

  async function deleteProject(name: string) {
    if (!supabase) return
    name = sanitizeName(name)
    loading = true
    error = null
    const path = `${folder}/${name}`
    const base = name.replace(/\.ooo$/, '')
    const tpPng = `${folder}/${base}.thumb.png`
    const tpWebp = `${folder}/${base}.thumb.webp`
    // Also remove from shared bucket
    const sp = sharedPath(name)
    await supabase.storage.from(SHARED_BUCKET).remove([sp, `${folder}/${base}.thumb.png`, `${folder}/${base}.thumb.webp`]).catch(() => {})
    const { error: err } = await supabase.storage.from(bucket).remove([path, tpPng, tpWebp])
    if (err) {
      error = err.message
    }
    await listProjects()
    loading = false
  }

  async function shareProject(name: string, content: string, thumbnail?: Blob, authorName?: string): Promise<string | null> {
    if (!supabase) return null
    name = sanitizeName(name)
    loading = true
    error = null

    const sp = sharedPath(name)
    const blob = new Blob([content], { type: 'text/plain' })

    const { error: upErr } = await supabase.storage.from(SHARED_BUCKET).upload(sp, blob, {
      upsert: true,
      contentType: 'text/plain',
    })
    if (upErr) {
      error = upErr.message
      loading = false
      return null
    }

    // Upload thumbnail to shared bucket
    if (thumbnail) {
      const st = `${folder}/${name.replace(/\.ooo$/, '.thumb.png')}`
      await supabase.storage.from(SHARED_BUCKET).upload(st, thumbnail, {
        upsert: true,
        contentType: 'image/png',
      })
    }

    // Upload author profile
    if (authorName) {
      const profileBlob = new Blob([JSON.stringify({ name: authorName })], { type: 'application/json' })
      await supabase.storage.from(SHARED_BUCKET).upload(`${folder}/_profile.json`, profileBlob, {
        upsert: true,
        contentType: 'application/json',
      })
    }

    loading = false
    const slug = slugFromName(name)
    return `${window.location.origin}/view/${folder}/${encodeURIComponent(slug)}`
  }

  async function unshareProject(name: string) {
    if (!supabase) return
    name = sanitizeName(name)
    const sp = sharedPath(name)
    const st = `${folder}/${name.replace(/\.ooo$/, '.thumb.png')}`
    await supabase.storage.from(SHARED_BUCKET).remove([sp, st])
  }

  return {
    get files() { return files },
    get loading() { return loading },
    get error() { return error },
    maxProjects: MAX_PROJECTS,
    listProjects,
    saveProject,
    loadProject,
    deleteProject,
    shareProject,
    unshareProject,
  }
}

/** Load a shared project by userId + slug (no auth required) */
export async function loadSharedProject(userId: string, slug: string): Promise<{ content: string; thumbUrl: string | null; authorName: string | null } | null> {
  if (!supabase) return null
  slug = sanitizeName(slug)
  const path = `${userId}/${slug}.ooo`
  const { data, error } = await supabase.storage.from(SHARED_BUCKET).download(path)
  if (error || !data) return null
  const content = await data.text()

  const thumbPath = `${userId}/${slug}.thumb.png`
  const { data: urlData } = supabase.storage.from(SHARED_BUCKET).getPublicUrl(thumbPath)
  const thumbUrl = urlData?.publicUrl ?? null

  // Fetch author name separately — must not block content delivery
  let authorName: string | null = null
  try {
    const { data: profileData, error: profileErr } = await supabase.storage.from(SHARED_BUCKET).download(`${userId}/_profile.json`)
    if (!profileErr && profileData) {
      const profile = JSON.parse(await profileData.text())
      authorName = profile.name ?? null
    }
  } catch {}

  return { content, thumbUrl, authorName }
}
