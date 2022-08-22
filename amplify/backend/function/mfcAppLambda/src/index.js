/* Amplify Params - DO NOT EDIT
    API_MFCAPP_GRAPHQLAPIENDPOINTOUTPUT
    API_MFCAPP_GRAPHQLAPIIDOUTPUT
    AUTH_MFCAPPF4FDFC42_USERPOOLID
    ENV
    REGION
Amplify Params - DO NOT EDIT */

const admin = require('./adminClient');
const graphApi = require('./graphApi');

const generateSchedule = (startDate, modules) => {
    var date = startDate;
    const schedule = [];
    modules.sort((a, b) => a.index - b.index);
    for (const module of modules) {
        const available = new Date(date.valueOf());
        const delay = module.delayNumber;
        switch (module.delayUOM) {
            case 'MINUTE':
                available.setMinutes(available.getMinutes() + delay);
                break;
            case 'HOUR':
                available.setHours(available.getHours() + delay);
                break;
            case 'DAY':
                available.setDate(available.getDate() + delay);
                break;
            case 'WEEK':
                available.setDate(available.getDate() + delay * 7);
                break;
            case 'MONTHS':
                available.setMonth(available.getMonth() + delay);
                break;
        }
        schedule.push({
            moduleId: module.id,
            availableAt: available
        });
        date = available;
    }
    return schedule;
}

const createUser = async (email, firstName, lastName) => {
    const user = await admin.createUser(email, firstName, lastName);
    const username = user.Username;
    await graphApi.createUser(username, email, firstName, lastName);
    return user;
}

const subscribeUser = async (username, courseId, startDate) => {
    const course = await graphApi.getCourse(courseId);
    if (!course) {
        throw Error("Could not find course");
    }

    const enrollment = await graphApi.createEnrollment(username, courseId, startDate);
    if (!enrollment) {
        throw Error("could not enroll user");
    }

    const schedule = generateSchedule(startDate, course.modules.items);
    for (const entry of schedule) {
        await graphApi.createModuleProgress(entry.moduleId, enrollment.id, entry.availableAt);
    }

    await admin.addUserToGroup(username, course.accessGroup);
}

const generateCourseSchedule = async (username, startDate, courseId, enrollmentId) => {
    const course = await graphApi.getCourse(courseId);
    const schedule = generateSchedule(startDate, course.modules.items);

    for (const entry of schedule) {
        await graphApi.createModuleProgress(username, entry.moduleId, enrollmentId, entry.availableAt);
    }
    return true;
}

const purchaseProgram = async (username, productId, transactionId) => {
    try {
        const program = await graphApi.getProgramByProductId(productId);
        const result = await graphApi.createMembership(username, program.id);
        return true;
    } catch (error) {
        console.error(error);
        return false;
    }
}

const resolvers = {
    Query: {
        adminListUsers: async ctx => {
            const { email } = ctx.arguments;
            return await admin.listUsers(email);
        },
        adminListGroups: async ctx => {
            return await admin.listGroups();
        },
        adminGetUser: async ctx => {
            const { username } = ctx.arguments;
            return await admin.getUser(username);
        }
    },
    Mutation: {
        adminAddUserToGroup: async ctx => {
            const { username, groupName } = ctx.arguments;
            return await admin.addUserToGroup(username, groupName);
        },
        subscribeUser: async ctx => {
            const { username, courseId, startDate } = ctx.arguments;
            await subscribeUser(username, courseId, startDate);
            return true;
        },
        adminCreateUser: async ctx => {
            const {email, firstName, lastName} = ctx.arguments;
            return await createUser(email, firstName, lastName);
        },
        adminDeleteUser: async ctx => {
            const { username } = ctx.arguments;
            return await admin.deleteUser(username)
        },
        adminCreateGroup: async ctx => {
            const { groupName, description } = ctx.arguments;
            return await admin.createGroup(groupName, description);
        },
        generateCourseSchedule: async ctx => {
            const {startDate, courseId, enrollmentId} = ctx.arguments;
            const { username } = ctx.identity;
            return await generateCourseSchedule(username, startDate, courseId, enrollmentId);
        },
        purchaseProgram: async ctx => {
            const {productId, transactionId} = ctx.arguments;
            const {username} = ctx.identity;
            return await purchaseProgram(username, productId, transactionId);
        }
    }
}

exports.handler = async (event) => {
    const typeHandler = resolvers[event.typeName];
    if (typeHandler) {
        const resolver = typeHandler[event.fieldName];
        if (resolver) {
            return await resolver(event);
        }
    }
    throw new Error("Resolver not found.");
};
