const MYFXBOOK =
  "https://widget.myfxbook.com/widget/calendar.html?impacts=0%2C1%2C2%2C3&lang=en&symbols=USD";
const FF =
  "https://nfs.faireconomy.media/ff_calendar_thisweek.json";

const MONTHS = {
  Jan:0, Feb:1, Mar:2, Apr:3, May:4, Jun:5,
  Jul:6, Aug:7, Sep:8, Oct:9, Nov:10, Dec:11
};

function decodeHtml(s=""){
  const named={amp:"&",lt:"<",gt:">",quot:'"',apos:"'",nbsp:" "};
  return String(s)
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)))
    .replace(/&([a-z]+);/gi,(m,n)=>Object.prototype.hasOwnProperty.call(named,n.toLowerCase())?named[n.toLowerCase()]:m);
}
function clean(s=""){
  return decodeHtml(String(s)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<br\s*\/?>/gi," ")
    .replace(/<[^>]+>/g," "))
    .replace(/\s+/g," ").trim();
}
function extractRows(html){
  const rows=[];
  const re=/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let m;
  while((m=re.exec(html))!==null){
    const cells=[];
    const cre=/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    let c;
    while((c=cre.exec(m[1]))!==null)cells.push(clean(c[1]));
    if(cells.length)rows.push(cells);
  }
  return rows;
}
function inferYear(monthIndex){
  const now=new Date();
  const y=now.getUTCFullYear(), m=now.getUTCMonth();
  if(m===11 && monthIndex===0)return y+1;
  if(m===0 && monthIndex===11)return y-1;
  return y;
}
function parseUtcDate(text){
  const m=String(text).match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})\b/i);
  if(!m)return null;
  const mon=MONTHS[m[1][0].toUpperCase()+m[1].slice(1,3).toLowerCase()];
  const year=inferYear(mon);
  return new Date(Date.UTC(year,mon,Number(m[2]),Number(m[3]),Number(m[4]))).toISOString();
}
function impact(v){
  const s=String(v).toLowerCase().trim();
  if(s==="high")return "High";
  if(s==="med"||s==="medium")return "Medium";
  if(s==="low")return "Low";
  return null;
}
function parseMyfxbook(html){
  const events=[];
  const rows=extractRows(html);

  for(const cells of rows){
    const impIdx=cells.findIndex(c=>impact(c));
    if(impIdx<0)continue;

    const eventIdx=cells.findIndex(c=>/\bUSD\b/.test(c));
    if(eventIdx<0)continue;

    const dtCell=cells.slice(0,eventIdx+1).find(c=>parseUtcDate(c));
    const date=dtCell?parseUtcDate(dtCell):null;
    if(!date)continue;

    let title=cells[eventIdx].replace(/^\s*USD\s*/i,"").trim();
    if(!title || title==="USD"){
      const candidate=cells[eventIdx+1] && eventIdx+1!==impIdx ? cells[eventIdx+1] : cells[eventIdx-1];
      title=(candidate||"Economic Event").replace(/^\s*USD\s*/i,"").trim();
    }

    const im=impact(cells[impIdx]);
    const previous=cells[impIdx+1]||"";
    const forecast=cells[impIdx+2]||"";
    const actual=cells[impIdx+3]||"";

    // Reject obvious header rows.
    if(/^(event|currency)$/i.test(title))continue;

    events.push({
      id:`${date}|${title}`,
      country:"USD",
      title,
      date,
      impact:im,
      previous,
      forecast,
      actual
    });
  }

  // Deduplicate rows that can appear in responsive + desktop tables.
  const seen=new Set();
  return events.filter(e=>{
    const k=`${e.id}|${e.previous}|${e.forecast}|${e.actual}`;
    if(seen.has(k))return false;
    seen.add(k); return true;
  });
}

async function fetchMyfxbook(){
  const r=await fetch(MYFXBOOK,{
    headers:{
      "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/151 Safari/537.36",
      "Accept":"text/html,application/xhtml+xml,*/*;q=0.8",
      "Accept-Language":"en-US,en;q=0.9",
      "Referer":"https://www.myfxbook.com/"
    },
    cache:"no-store"
  });
  if(!r.ok)throw new Error(`Myfxbook HTTP ${r.status}`);
  const html=await r.text();
  const events=parseMyfxbook(html);
  if(!events.length)throw new Error("Myfxbook returned no parseable USD calendar rows");
  return events;
}

async function fetchForexFactory(){
  const r=await fetch(FF,{
    headers:{"User-Agent":"Mozilla/5.0","Accept":"application/json,text/plain,*/*"},
    cache:"no-store"
  });
  if(!r.ok)throw new Error(`Forex Factory HTTP ${r.status}`);
  const data=await r.json();
  if(!Array.isArray(data))throw new Error("Unexpected Forex Factory response");
  return data.filter(e=>e.country==="USD").map((e,i)=>({
    id:`${e.date}|${e.title}|${i}`,
    country:"USD",title:e.title,date:e.date,impact:e.impact,
    actual:"",forecast:e.forecast||"",previous:e.previous||""
  }));
}

module.exports=async function handler(req,res){
  res.setHeader("Content-Type","application/json; charset=utf-8");
  res.setHeader("Cache-Control","no-store, max-age=0");

  try{
    const events=await fetchMyfxbook();
    return res.status(200).json({
      events,live:true,source:"Myfxbook",
      parsedEvents:events.length,fetchedAt:new Date().toISOString()
    });
  }catch(myfxbookError){
    try{
      const events=await fetchForexFactory();
      return res.status(200).json({
        events,live:false,source:"Forex Factory fallback",
        liveError:myfxbookError instanceof Error?myfxbookError.message:String(myfxbookError),
        fetchedAt:new Date().toISOString()
      });
    }catch(ffError){
      return res.status(502).json({
        error:"Both calendar sources failed",
        myfxbookError:myfxbookError instanceof Error?myfxbookError.message:String(myfxbookError),
        forexFactoryError:ffError instanceof Error?ffError.message:String(ffError)
      });
    }
  }
};
