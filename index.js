const fs = require("fs");
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require("discord.js");
require("./keep_alive");
const { token, prefix, color } = require("./config");

const client = new Client({
    intents:[
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates
    ]
});

// ---------------------- DATA ----------------------
let dataFile = "./data.json";
let data = fs.existsSync(dataFile)? JSON.parse(fs.readFileSync(dataFile,"utf8")) : {
    points:{}, vc:{}, chat:{}, roles:{}, channels:{}, protection:{}, robEnabled:true, cooldowns:{}, lastLeaderboard:{}
};
function saveData(){ fs.writeFileSync(dataFile,JSON.stringify(data,null,4)); }

// ---------------------- HELPERS ----------------------
function sendEmbed(channel,title,desc){
    channel.send({embeds:[new EmbedBuilder().setTitle(title).setDescription(desc).setColor(color).setFooter({text:"Updates every 5 minutes"})]});
}
function isProtected(target){
    if(!target) return false;
    const r = data.roles;
    if(r.mod && target.roles.cache.has(r.mod)) return true;
    if(r.admin && target.roles.cache.has(r.admin)) return true;
    if(r.owner && target.id===r.owner) return true;
    return false;
}
function checkPoints(member,amt){ return (data.points[member.id]||0)>=amt; }
function addPoints(member,amt){ data.points[member.id]=(data.points[member.id]||0)+amt; saveData(); }
function removePoints(member,amt){ data.points[member.id]=(data.points[member.id]||0)-amt; saveData(); }
function randomInt(min,max){ return Math.floor(Math.random()*(max-min+1))+min; }

// ---------------------- LEADERBOARDS ----------------------
async function postLeaderboard(type,guild){
    const chID = data.channels[type]; if(!chID) return;
    const channel = guild.channels.cache.get(chID); if(!channel) return;
    let stats = data[type];
    let sorted = Object.entries(stats).sort((a,b)=>b[1]-a[1]).slice(0,7);
    let desc = "";
    sorted.forEach((entry,i)=>{
        let user = guild.members.cache.get(entry[0]); if(!user) return;
        let value = type==="vc"? `${entry[1]} min(s)` : `${entry[1]} msg(s)`;
        if(i===0) desc+=`🥇 • ${user} • ${value}\n`;
        else if(i===1) desc+=`🥈 • ${user} • ${value}\n`;
        else if(i===2) desc+=`🥉 • ${user} • ${value}\n`;
        else desc+=`${i+1} • ${user} • ${value}\n`;
    });
    const embed = new EmbedBuilder().setTitle(type==="vc"?"Voice Leaderboard":"Messages Leaderboard").setDescription(desc||"No data yet.").setColor(color).setFooter({text:"Updates every 5 minutes"});
    let lastMsgID = data.lastLeaderboard?.[type];
    if(lastMsgID){
        try{
            const lastMsg = await channel.messages.fetch(lastMsgID);
            await lastMsg.edit({embeds:[embed]});
            return;
        }catch(e){}
    }
    const newMsg = await channel.send({embeds:[embed]});
    data.lastLeaderboard[type]=newMsg.id;
    saveData();
}
setInterval(()=>{ client.guilds.cache.forEach(guild=>{ postLeaderboard("vc",guild); postLeaderboard("chat",guild); }); },5*60*1000);

// ---------------------- MESSAGE HANDLER ----------------------
client.on("messageCreate", async message=>{
    if(message.author.bot) return;
    if(!message.content.startsWith(prefix)) return;
    const args = message.content.slice(prefix.length).trim().split(/ +/g);
    const cmd = args.shift().toLowerCase();
    const member = message.member;

    // ---------------------- HELP ----------------------
    if(cmd==="help"){
        const desc = `
**Leaderboards**
**.upload lb** - Upload leaderboards
**.set vc #channel** - Set VC leaderboard channel
**.set chat #channel** - Set Chat leaderboard channel

**Casino / Points**
**.bal / .balance** - Check points
**.give @user <amt>** - Give points
**.daily / .dj** - Claim daily points
**.gamble / .gam <amt>** - Gamble points
**.cf <amt> <heads/tails>** - Coinflip
**.sl / .slots <amt>** - Slots
**.bj <amt>** - Blackjack
**.dice <amt>** - Roll dice
**.roulette <amt> <color>** - Roulette
**.crash <amt>** - Crash game
**.mines <amt> <bombs>** - Mines game
**.jackpot** - Claim jackpot
**.rob @user** - Rob points
**.protect** - Self-protect
**.disable rob / .enable rob** - Toggle rob

**Moderation**
**.clear <amt>** - Delete messages
**.lock / .unlock** - Lock/unlock channel
**.snipe** - Show last deleted message

**Roles**
**.role @user <role> / .r @user <role>** - Add role
**.remrole @user <role> / .rr @user <role>** - Remove role
**.roles @user** - Show roles
**.set modrole @role**
**.set adminrole @role**
**.set ownerrole @role**

**Other**
**.stats** - VC minutes & tier
        `;
        sendEmbed(message.channel,"Help Menu",desc);
    }

    // ---------------------- POINTS ----------------------
    else if(["bal","balance"].includes(cmd)){
        const pts = data.points[member.id]||0;
        sendEmbed(message.channel,"Balance",`**${member} • ${pts} points**`);
    }
    else if(cmd==="give"){
        let target = message.mentions.members.first();
        let amount = parseInt(args[1]||args[0]);
        if(!target||isNaN(amount)) return message.reply("Invalid usage.");
        if(!checkPoints(member,amount)) return message.reply("Not enough points.");
        removePoints(member,amount); addPoints(target,amount);
        sendEmbed(message.channel,"Give Points",`**${member} gave ${amount} points to ${target}**`);
    }

    // ---------------------- DAILY ----------------------
    else if(cmd==="daily"||cmd==="dj"){
        let cd = data.cooldowns[member.id]?.daily||0;
        if(Date.now()-cd<24*60*60*1000) return message.reply("Daily already claimed.");
        addPoints(member,500);
        data.cooldowns[member.id]={...data.cooldowns[member.id],daily:Date.now()};
        saveData();
        sendEmbed(message.channel,"Daily Claim",`**${member} claimed 500 points!**`);
    }

    // ---------------------- CASINO ----------------------
    else if(["gamble","gam"].includes(cmd)){
        let amt=parseInt(args[0]);
        if(isNaN(amt)||amt<1) return message.reply("Invalid amount.");
        if(!checkPoints(member,amt)) return message.reply("Not enough points.");
        let won = Math.random()<0.5;
        if(won){ addPoints(member,amt); sendEmbed(message.channel,"Gamble","You won **"+amt+" points!**"); }
        else{ removePoints(member,amt); sendEmbed(message.channel,"Gamble","You lost **"+amt+" points!**"); }
    }

    else if(cmd==="cf"){
        let amt=parseInt(args[0]);
        let choice = args[1]?.toLowerCase();
        if(!["heads","tails"].includes(choice)) return message.reply("Choose heads/tails.");
        if(!checkPoints(member,amt)) return message.reply("Not enough points.");
        let outcome = Math.random()<0.5?"heads":"tails";
        if(choice===outcome){ addPoints(member,amt); sendEmbed(message.channel,"Coinflip","You won **"+amt+" points!**"); }
        else{ removePoints(member,amt); sendEmbed(message.channel,"Coinflip","You lost **"+amt+" points!**"); }
    }

    else if(["sl","slots"].includes(cmd)){
        let amt=parseInt(args[0]);
        if(!checkPoints(member,amt)) return message.reply("Not enough points.");
        const symbols=["🍒","🍋","⭐","💎","7️⃣"];
        let roll=[symbols[randomInt(0,symbols.length-1)],symbols[randomInt(0,symbols.length-1)],symbols[randomInt(0,symbols.length-1)]];
        let multiplier = roll[0]===roll[1]&&roll[1]===roll[2]?5:roll[0]===roll[1]||roll[1]===roll[2]?2:0;
        if(multiplier>0){ addPoints(member,amt*multiplier); sendEmbed(message.channel,"Slots",`**${roll.join(" ")} • You won ${amt*multiplier} points!**`); }
        else{ removePoints(member,amt); sendEmbed(message.channel,"Slots",`**${roll.join(" ")} • You lost ${amt} points.**`); }
    }

    else if(cmd==="bj"){
        let amt=parseInt(args[0]); if(!checkPoints(member,amt)) return message.reply("Not enough points.");
        let player=Math.floor(Math.random()*11+11);
        let dealer=Math.floor(Math.random()*11+11);
        if(player>21) removePoints(member,amt), sendEmbed(message.channel,"Blackjack",`**You busted with ${player} vs dealer ${dealer} • Lost ${amt} points**`);
        else if(player>dealer) addPoints(member,amt*2), sendEmbed(message.channel,"Blackjack",`**You won ${amt*2} points! (${player} vs ${dealer})**`);
        else removePoints(member,amt), sendEmbed(message.channel,"Blackjack",`**You lost ${amt} points. (${player} vs ${dealer})**`);
    }

    else if(cmd==="dice"){
        let amt=parseInt(args[0]); if(!checkPoints(member,amt)) return message.reply("Not enough points.");
        let player=randomInt(1,6), botRoll=randomInt(1,6);
        if(player>botRoll) addPoints(member,amt*2), sendEmbed(message.channel,"Dice",`**You rolled ${player} vs ${botRoll} • Won ${amt*2} points!**`);
        else removePoints(member,amt), sendEmbed(message.channel,"Dice",`**You rolled ${player} vs ${botRoll} • Lost ${amt} points.**`);
    }

    else if(cmd==="roulette"){
        let amt=parseInt(args[0]); let color=args[1]?.toLowerCase(); if(!checkPoints(member,amt)) return message.reply("Not enough points.");
        const outcome=["red","black","green"][randomInt(0,2)];
        if(color===outcome){ let mult=outcome==="green"?14:2; addPoints(member,amt*mult); sendEmbed(message.channel,"Roulette",`**Won ${amt*mult} points! (${outcome})**`); }
        else removePoints(member,amt), sendEmbed(message.channel,"Roulette",`**Lost ${amt} points. (${outcome})**`);
    }

    else if(cmd==="crash"){ let amt=parseInt(args[0]); if(!checkPoints(member,amt)) return message.reply("Not enough points."); let mult=randomInt(1,10); addPoints(member,amt*mult); sendEmbed(message.channel,"Crash",`**Won ${amt*mult} points! (Multiplier x${mult})**`); }

    else if(cmd==="mines"){ let amt=parseInt(args[0]), bombs=parseInt(args[1]); if(!checkPoints(member,amt)) return message.reply("Not enough points."); let safe=Math.max(1,5-bombs); addPoints(member,amt*safe); sendEmbed(message.channel,"Mines",`**Won ${amt*safe} points!**`); }

    else if(cmd==="jackpot"){ let win=randomInt(0,1000); addPoints(member,win); sendEmbed(message.channel,"Jackpot",`**You won ${win} points!**`); }

    // ---------------------- ROB / PROTECT ----------------------
    else if(cmd==="rob"){
        if(!data.robEnabled) return message.reply("Rob is disabled.");
        let target = message.mentions.members.first();
        if(!target||data.protection[target.id]) return message.reply("Cannot rob target.");
        let robAmount = Math.min(data.points[target.id]||0,randomInt(50,100));
        removePoints(target,robAmount); addPoints(member,robAmount);
        sendEmbed(message.channel,"Rob",`**${member} robbed ${robAmount} points from ${target}**`);
    }
    else if(cmd==="protect"){ data.protection[member.id]=true; saveData(); sendEmbed(message.channel,"Protection","**You are now protected!**"); }
    else if(cmd==="disable"&&args[0]==="rob"){ data.robEnabled=false; saveData(); sendEmbed(message.channel,"Rob Disabled","Rob has been disabled."); }
    else if(cmd==="enable"&&args[0]==="rob"){ data.robEnabled=true; saveData(); sendEmbed(message.channel,"Rob Enabled","Rob has been enabled."); }

    // ---------------------- ROLE MANAGEMENT ----------------------
    else if(["role","r"].includes(cmd)){
        let target = message.mentions.members.first();
        let roleName = args.slice(1).join(" ");
        if(!target||!roleName) return;
        if(isProtected(target)) return message.reply("Cannot modify staff roles.");
        let role = message.guild.roles.cache.find(r=>r.name.toLowerCase()===roleName.toLowerCase());
        if(!role) return;
        await target.roles.add(role); sendEmbed(message.channel,"Role Added",`**${target} • ${role.name}**`);
    }
    else if(["remrole","rr"].includes(cmd)){
        let target = message.mentions.members.first();
        let roleName = args.slice(1).join(" ");
        if(!target||!roleName) return;
        if(isProtected(target)) return message.reply("Cannot modify staff roles.");
        let role = message.guild.roles.cache.find(r=>r.name.toLowerCase()===roleName.toLowerCase());
        if(!role) return;
        await target.roles.remove(role); sendEmbed(message.channel,"Role Removed",`**${target} • ${role.name}**`);
    }
    else if(cmd==="roles"){
        let target = message.mentions.members.first()||member;
        let rolesList = target.roles.cache.filter(r=>r.name!=="@everyone").map(r=>`• ${r.name}`).join("\n");
        sendEmbed(message.channel,`Roles for ${target.user.username}`,rolesList||"No roles");
    }

    // ---------------------- STATS ----------------------
    else if(cmd==="stats"){
        let vcMins = data.vc[member.id]||0;
        let tier="Tier 1";
        if(vcMins>=720) tier="Tier 5";
        else if(vcMins>=360) tier="Tier 4";
        else if(vcMins>=180) tier="Tier 3";
        else if(vcMins>=60) tier="Tier 2";
        sendEmbed(message.channel,"VC Stats",`**${member} • ${vcMins} min(s) • ${tier}**`);
    }

    // ---------------------- CLEAR ----------------------
    else if(cmd==="clear"){
        if(!member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return;
        let amount=parseInt(args[0]);
        if(isNaN(amount)||amount<1) return;
        message.channel.bulkDelete(amount,true);
    }
});

// ---------------------- TRACK VC MINUTES ----------------------
client.on("voiceStateUpdate",(oldState,newState)=>{
    if(oldState.channelId===newState.channelId) return;
    if(oldState.channel && !oldState.channel.members.has(oldState.id)){
        let joinTime = oldState.joinedAt||Date.now();
        let duration = Math.floor((Date.now()-joinTime)/60000);
        data.vc[oldState.id]=(data.vc[oldState.id]||0)+duration;
        saveData();
    }
});

client.login(token);
