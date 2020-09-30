const{createEmbed,hasRole,sendEmbed,sendEmbedWithChannel}=require("../functions");
const{blue,red}=require('../colors.json');
const{cook}=require('../roles.json');
const{text}=require('../channels.json');
const{query}=require("../dbfunctions");

module.exports={
    name:"claim",
    description:"claim an order as cook",
    args:true,
    minArgs:1,
    maxArgs:1,
    usage:"<order id>",
    cooldown:0,
    userType:"worker",
    pponly:false,
    async execute(message,args,client){
        let embedMsg=createEmbed(blue,`**${this.name}**`);
        const cookRole=client.guild.roles.cache.get(cook);
        if(!hasRole(client.member,cook)){
            embedMsg.setColor(red).setDescription(`You need to have te ${cookRole.name} role in ${client.guild.name} to be able to claim an order`);
            return sendEmbed(embedMsg,message);
        }
        let results=await query("SELECT * FROM `order` WHERE orderId = ?",[args[0]]);
        if(!results.length){
            embedMsg.setColor(red).setDescription(`Order ${args[0]} does not exist`);
            return sendEmbed(embedMsg,message);
        }
        if(results[0].status=="claimed"){
            embedMsg.setColor(red).setDescription(`Order ${args[0]} has already been claimed`);
            return sendEmbed(embedMsg,message);
        }
        if(message.author.id==results[0].userId){
            embedMsg.setColor(red).setDescription("You can't claim your own order");
            return sendEmbed(embedMsg,message);
        }
        const user=client.users.cache.get(results[0].userId);
        query("UPDATE `order` SET cookId = ?, status = 'claimed' WHERE orderId = ?",[message.author.id,args[0]]);
        embedMsg.setDescription(`You have claimed order ${args[0]}`);
        sendEmbed(embedMsg,message);
        embedMsg.setTitle("Confirmation").setDescription(`Your order has been claimed by <@${message.author.id}>`);
        user.send(embedMsg).then(()=>{
            setTimeout(async function(){
                results=await query("SELECT status FROM `order` WHERE orderId = ?",[args[0]]);
                if(!results.length)return;
                if(results[0].status=="claimed"){
                    embedMsg.setTitle(`**${this.name}**`).setDescription(`Order ${args[0]} has been declaimed because the cook took to long to cook the order`);
                    query("UPDATE `order` SET cookId = NULL, status = 'not claimed' WHERE orderId = ?",[args[0]]).then(()=>{
                        const channel=client.channels.cache.get(text.kitchen);
                        sendEmbedWithChannel(embedMsg,client,channel);
                        embedMsg.setTitle("Confirmation").setDescription(`Your order has been declaimed bacuase the cook took to long to cook the order`);
                        user.send(embedMsg).catch(console.error);
                    }).catch(console.error);
                }
            },600000);
        }).catch(console.error);
    }
}