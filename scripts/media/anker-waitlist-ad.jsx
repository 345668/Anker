export default async ({ project }) => {
 const p = await project({dir:"/home/user/anker-edit",size:"720x1280",fps:24,background:"#ffffff"});
 const footage=await p.add("/home/user/source.mp4");
 const logo=await p.add("/home/user/logo.png");
 p.compose(<frame width={720} height={1280} layout="none">
  <media file={footage} x={0} y={0} width={720} height={1280} fit="cover"/>
  <frame x={52} y={170} width={616} height={170} at={0.5} duration={2.7} layout="none" motion={{exit:{to:{opacity:0,y:-12},duration:0.22}}}>
   <text x={0} y={0} width={616} height={160} fontFamily="Montserrat" fontSize={52} color="#ffffff" shadow={{x:0,y:2,blur:10,color:"#051c2c"}} motion={{by:"word",from:{opacity:0,y:20},duration:0.32,overlap:0.45,easing:"house"}}>Venture moves fast.</text>
  </frame>
  <frame x={52} y={170} width={616} height={160} at={5.75} duration={3.4} layout="none" motion={{enter:{from:{x:-24,opacity:0},duration:0.45},exit:{to:{opacity:0},duration:0.25}}}>
   <text x={0} y={0} width={616} height={160} fontFamily="Montserrat" fontSize={52} color="#ffffff" shadow={{x:0,y:2,blur:10,color:"#051c2c"}}>Stay anchored.</text>
  </frame>
 </frame>,{at:0,dur:10,name:"Wild ride — two headline beats"});
 p.compose(<frame width={720} height={1280} layout="none" background="#ffffff">
   <frame x={55} y={255} width={610} height={239} layout="none" motion={{enter:{from:{opacity:0,y:18},duration:0.55}}}>
    <media file={logo} x={0} y={0} width={610} height={239} fit="contain"/>
   </frame>
   <rect x={304} y={555} width={112} height={3} fill="#051c2c" animate={[{property:"scaleX",from:0,to:1,at:0.25,duration:0.5,easing:"ease-out"}]}/>
   <frame x={60} y={618} width={600} height={190} layout="none" motion={{enter:{from:{opacity:0,y:16},at:0.35,duration:0.4}}}>
    <text x={0} y={0} width={600} height={65} align="center" fontFamily="Montserrat" fontSize={40} color="#051c2c">Join the waitlist</text>
    <text x={0} y={86} width={600} height={60} align="center" fontFamily="Montserrat" fontSize={30} color="#051c2c">an-ker.de/waitlist</text>
   </frame>
 </frame>,{at:10,dur:4,name:"Anker logo and waitlist"});
 await p.render("/home/user/native.mp4",{bitrate:6000000,concurrency:2});
};