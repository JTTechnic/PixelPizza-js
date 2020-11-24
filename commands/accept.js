const PixelPizza = require("pixel-pizza");
const { green, gray, red } = PixelPizza.colors;
const { query } = require("../dbfunctions");
const { sendEmbed, capitalize, editEmbed, createEmbed } = PixelPizza;

module.exports = {
    name: "accept",
    description: "accept an application",
    aliases: ["acceptapp"],
    args: true,
    minArgs: 1,
    maxArgs: 1,
    usage: "<application id>",
    cooldown: 0,
    userType: "staff",
    neededPerms: [],
    pponly: true,
    removeExp: false,
    async execute(message, args, client) {
        const embedMsg = createEmbed({
            color: red.hex,
            title: `**${capitalize(this.name)}**`
        });
        const applications = await query("SELECT * FROM application WHERE applicationId = ? AND status = 'none'", [args[0]]);
        if(!applications.length){
            return sendEmbed(editEmbed(embedMsg, {
                description: "The application could not be found or has already been accepted or rejected"
            }), message);
        }
        if(message.author.id === applications[0].userId){
            return sendEmbed(editEmbed(embedMsg, {
                description: "You can't accept your own application"
            }), message);
        }
        const member = client.guildMembers.get(applications[0].userId);
        if(!member){
            return sendEmbed(editEmbed(embedMsg, {
                description: `This user is not in Pixel Pizza`
            }), message);
        }
        await query("UPDATE application SET status = 'accepted', staffId = ? WHERE applicationId = ?", [message.author.id, args[0]]);
        sendEmbed(editEmbed(embedMsg, {
            color: green.hex,
            description: `${member} has been accepted`
        }), message);
        member.user.send(createEmbed({
            color: gray.hex,
            title: "Accepted",
            description: "Your application has been accepted"
        }));
    }
}