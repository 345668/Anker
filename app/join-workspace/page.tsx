"use client"
import { useEffect, useState } from "react"
import Link from "next/link"
export default function JoinWorkspace() {
  const [token,setToken]=useState(""),[invite,setInvite]=useState<any>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[signIn,setSignIn]=useState(false)
  useEffect(()=>{setToken(window.location.hash.slice(1))},[])
  async function request(action:"preview"|"accept") {
    setBusy(true);setError("")
    try {
      const response=await fetch("/api/org/invitations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({token,action})})
      const data=await response.json();setSignIn(response.status===401)
      if(!response.ok)throw Error(data.error || "The invitation could not be opened.")
      if(action==="accept")window.location.assign("/dashboard")
      else setInvite(data.invitation)
    }catch(cause){setError(cause instanceof Error?cause.message:"The invitation could not be opened.")}
    finally{setBusy(false)}
  }
  return <main className="mx-auto min-h-screen max-w-xl px-6 py-20"><p className="text-xs uppercase tracking-widest text-muted-foreground">Anker workspace invitation</p><h1 className="mt-3 font-serif text-3xl">Join your team.</h1><p className="mt-4 text-sm text-muted-foreground">Use the verified account email that received this invitation. Reviewing the link does not join the workspace.</p>
    {error&&<p role="alert" className="my-5 border p-4">{error}</p>}
    {!token?<p className="my-6">Open the complete invitation link, including the part after #.</p>:<>
      {signIn&&<Link className="my-4 inline-flex min-h-11 items-center underline" href={`/auth/login?next=${encodeURIComponent(`/join-workspace#${token}`)}`}>Sign in with the invited email</Link>}
      {invite?<section className="my-6 border border-border bg-card p-5"><h2 className="font-serif text-2xl">{invite.name}</h2><p className="my-3">Role: {invite.role}. Investor-update sending: {invite.can_send_outreach?"allowed":"not allowed"}.</p><p className="mb-4 text-sm">You will gain access to this workspace’s shared records. Your other workspaces stay separate.</p><button className="min-h-11 rounded border px-5" disabled={busy} onClick={()=>void request("accept")}>{busy?"Joining…":"Accept invitation"}</button></section>:<button className="mt-6 min-h-11 rounded border px-5" disabled={busy} onClick={()=>void request("preview")}>{busy?"Checking…":"Review invitation"}</button>}
    </>}<Link className="mt-8 block underline" href="/dashboard/entities">Manage my workspaces</Link></main>
}
