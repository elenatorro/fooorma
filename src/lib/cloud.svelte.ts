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
    return `${folder}/${oooName.replace(/\.ooo$/, '.thumb.webp')}`
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
      // Load signed URLs for private buckets
      for (let i = 0; i < files.length; i++) {
        const tp = thumbPath(files[i].name)
        const { data: signedData } = await supabase!.storage.from(bucket).createSignedUrl(tp, 3600)
        if (signedData?.signedUrl) {
          files[i] = { ...files[i], thumbUrl: signedData.signedUrl }
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
        contentType: 'image/webp',
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
    const tp = thumbPath(name)
    // Also remove from shared bucket
    const sp = sharedPath(name)
    const st = `${folder}/${name.replace(/\.ooo$/, '.thumb.webp')}`
    await supabase.storage.from(SHARED_BUCKET).remove([sp, st]).catch(() => {})
    const { error: err } = await supabase.storage.from(bucket).remove([path, tp])
    if (err) {
      error = err.message
    }
    await listProjects()
    loading = false
  }

  async function shareProject(name: string, content: string, thumbnail?: Blob): Promise<string | null> {
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
      const st = `${folder}/${name.replace(/\.ooo$/, '.thumb.webp')}`
      await supabase.storage.from(SHARED_BUCKET).upload(st, thumbnail, {
        upsert: true,
        contentType: 'image/webp',
      })
    }

    loading = false
    const slug = slugFromName(name)
    return `${window.location.origin}${window.location.pathname}#/view/${folder}/${encodeURIComponent(slug)}`
  }

  async function unshareProject(name: string) {
    if (!supabase) return
    name = sanitizeName(name)
    const sp = sharedPath(name)
    const st = `${folder}/${name.replace(/\.ooo$/, '.thumb.webp')}`
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
export async function loadSharedProject(userId: string, slug: string): Promise<{ content: string; thumbUrl: string | null } | null> {
  if (!supabase) return null
  slug = sanitizeName(slug)
  const path = `${userId}/${slug}.ooo`
  const { data, error } = await supabase.storage.from(SHARED_BUCKET).download(path)
  if (error || !data) return null
  const content = await data.text()

  const thumbPath = `${userId}/${slug}.thumb.webp`
  const { data: urlData } = supabase.storage.from(SHARED_BUCKET).getPublicUrl(thumbPath)
  return { content, thumbUrl: urlData?.publicUrl ?? null }
}
